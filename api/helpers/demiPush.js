'use strict';

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const client = require('./pushClient')({
  name: 'demiPush',
  baseEnv: 'DEMI_API_BASE',
  keyEnv: 'DEMI_APIM_KEY',
  keyHeader: 'Ocp-Apim-Subscription-Key',
  method: 'PUT'
});

const LABEL_FIELDS = ['type', 'milestone', 'projectPhase', 'documentAuthorType'];
// Project fields stored as a bare List ref. eagle-public reads `name` off each one and
// `legislation` off the phase to pick its stage rail (assessment-stages.ts); `type` rides along
// for parity with the List row, no consumer reads it today.
const LIST_REF_FIELDS = ['eacDecision', 'currentPhaseName', 'CEAAInvolvement'];
const LEGISLATION_KEYS = ['legislation_1996', 'legislation_2002', 'legislation_2018'];

// ponytail: memoized for process lifetime; add a TTL if List items start changing while pods are up
let listEntriesPromise = null;

function listEntries() {
  if (!listEntriesPromise) {
    listEntriesPromise = Promise.resolve(mongoose.model('List').find({ _schemaName: 'List' }, '_id name item type legislation').lean())
      .then(items => new Map(items.map(i => [String(i._id), i])))
      .catch(err => {
        listEntriesPromise = null;
        throw err;
      });
  }
  return listEntriesPromise;
}

// An ObjectId or a hex string, as a plain id string. A ref the caller did populate is handed back
// untouched by the resolvers below before it ever reaches here.
function idOf(value) {
  return value ? String(value) : null;
}

async function orgsById(ids) {
  if (!ids.length) {
    return new Map();
  }
  const orgs = await mongoose.model('Organization').find({ _id: { $in: ids } }, '_id name province').lean();
  return new Map(orgs.map(o => [String(o._id), o]));
}

// The List item holds the agency URL the public site links the regulation name to.
function regulationOf(value, lists) {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && value.name !== undefined) {
    return value;
  }
  const id = idOf(value);
  const entry = lists.get(id) || {};
  return { _id: id, name: entry.name || null, item: entry.item || null };
}

// A List ref DEMI copies verbatim. An id with no List row is left exactly as it arrived rather than
// blanked, so a stale ref still reaches DEMI and the reconcile can see it; the caller logs it once.
function listRefOf(value, lists, unresolved) {
  if (!value) {
    return value;
  }
  if (typeof value === 'object' && value.name !== undefined) {
    return value;
  }
  const id = idOf(value);
  const entry = lists.get(id);
  if (!entry) {
    unresolved.add(id);
    return value;
  }
  return { _id: id, name: entry.name || null, type: entry.type || null, legislation: entry.legislation ?? null };
}

// Never mutate the caller's document: the push carries resolved fields the Mongo schema has no room for.
function toPushBody(doc) {
  if (typeof doc.toObject === 'function') {
    return doc.toObject();
  }
  const body = Object.assign({}, doc);
  for (const key of LEGISLATION_KEYS) {
    if (body[key] && typeof body[key] === 'object') {
      body[key] = Object.assign({}, body[key]);
    }
  }
  return body;
}

// DEMI flattens a project out of its legislation block, so per-legislation labels have to land
// inside the block; pins and featuredDocuments are top-level in Mongo and stay there.
async function enrichProject(project) {
  const blocks = LEGISLATION_KEYS.map(key => project[key]).filter(b => b && typeof b === 'object');
  const pinIds = Array.isArray(project.pins) ? project.pins.map(idOf).filter(Boolean) : [];
  const orgIds = new Set(pinIds);
  for (const block of blocks) {
    const id = idOf(block.proponent);
    if (id) {
      orgIds.add(id);
    }
  }

  const needsLists = blocks.some(b => b.applicableRegulation ||
    LIST_REF_FIELDS.some(field => b[field]) ||
    (Array.isArray(b.phaseHistory) && b.phaseHistory.length));

  const [lists, orgs] = await Promise.all([
    needsLists ? listEntries() : new Map(),
    orgsById(Array.from(orgIds))
  ]);

  const unresolved = new Set();
  for (const block of blocks) {
    block.applicableRegulation = regulationOf(block.applicableRegulation, lists);
    for (const field of LIST_REF_FIELDS) {
      block[field] = listRefOf(block[field], lists, unresolved);
    }
    if (Array.isArray(block.phaseHistory)) {
      block.phaseHistory = block.phaseHistory.map(entry => listRefOf(entry, lists, unresolved));
    }
    const proponentId = idOf(block.proponent);
    const proponent = proponentId ? orgs.get(proponentId) : null;
    block.proponentId = proponentId;
    block.proponentName = (proponent && proponent.name) || null;
  }

  if (Array.isArray(project.pins)) {
    // Pin visibility is the project's pinsRead, not the org's own read (api/controllers/pins.js:64-66).
    // An id whose org is gone from Mongo drops, as it does in handleGetPins.
    project.pins = pinIds
      .map(id => orgs.get(id))
      .filter(Boolean)
      .map(o => ({ _id: String(o._id), name: o.name || null, province: o.province || null }));
  }
  if (Array.isArray(project.featuredDocuments)) {
    project.featuredDocuments = project.featuredDocuments.map(idOf).filter(Boolean);
  }
  if (unresolved.size) {
    defaultLog.warn(`[demiPush] project ${project._id}: List ids not found, pushed as ids`, { ids: Array.from(unresolved) });
  }
}

const CONNECTED = 1;

// Mongoose model behind each DEMI route segment, for the re-read before a push.
const MODEL_BY_KIND = {
  projects: 'Project',
  documents: 'Document',
  commentperiods: 'CommentPeriod',
  comments: 'Comment',
  organizations: 'Organization',
  notifications: 'ProjectNotification',
  updates: 'RecentActivity'
};

// One push in flight per record. DEMI takes the last writer, so two mirrors of the same record
// racing each other (save-and-publish fires both) could otherwise land in the wrong order.
const chains = new Map();

function serialize(key, run) {
  const previous = chains.get(key) || Promise.resolve();
  const next = previous.then(run, run);
  chains.set(key, next);
  const drain = () => {
    if (chains.get(key) === next) {
      chains.delete(key);
    }
  };
  next.then(drain, drain);
  return next;
}

async function readById(model, id) {
  try {
    return { doc: await model.findById(id) };
  } catch (err) {
    return { error: err };
  }
}

// A mirror push re-reads the stored document after the write. A miss or a failed read leaves DEMI
// on the pre-write state, so it is logged; the caller's own HTTP response is unaffected.
exports.freshDoc = async function (model, id) {
  const read = await readById(model, id);
  if (read.error) {
    defaultLog.warn(`[demiPush] skipping push: ${model.modelName} ${id} re-read failed`, { error: read.error.message });
  } else if (!read.doc) {
    defaultLog.warn(`[demiPush] skipping push: ${model.modelName} ${id} not found on re-read`);
  }
  return read.doc || null;
};

function modelFor(kind) {
  const name = MODEL_BY_KIND[kind];
  if (!name) {
    return null;
  }
  try {
    return mongoose.model(name);
  } catch (err) {
    return null;
  }
}

// The caller's snapshot can be a write behind by the time its turn in the chain comes, so the body
// is built from the row as Mongo holds it now. Without a live connection there is nothing to read:
// mongoose would only buffer the query until it times out.
async function currentDoc(kind, id, snapshot) {
  const model = modelFor(kind);
  if (!model || !model.db || model.db.readyState !== CONNECTED) {
    return snapshot;
  }
  const read = await readById(model, id);
  if (read.error) {
    defaultLog.warn(`[demiPush] ${kind} ${id} re-read failed, pushing the caller's copy`, { error: read.error.message });
    return snapshot;
  }
  if (!read.doc) {
    // Row is gone, so the snapshot is the last state DEMI can be told about — and on a delete
    // mirror it is the body carrying the marker the row itself never held.
    defaultLog.debug(`[demiPush] ${kind} ${id} gone from Mongo, pushing the caller's copy`);
    return snapshot;
  }
  return read.doc;
}

function push(kind, id, body) {
  // No /api segment: the APIM machine API's backend already carries it
  return client.push(`/eagle/${kind}/${id}`, body, `${kind} ${id}`);
}

// Every mirror runs through here. `extra` says what the stored document cannot: a hard delete
// leaves nothing to re-read, so the caller's own copy carries the marker instead.
function mirrorPush(kind, label, doc, extra, buildBody) {
  if (!client.configured() || !doc || !doc._id) {
    return Promise.resolve(true);
  }
  const id = doc._id;
  return serialize(`${kind}:${id}`, async () => {
    try {
      const current = await currentDoc(kind, id, doc);
      // Pods push the same record independently, so DEMI keeps the newest stamp and drops an older body.
      const pushedAt = Date.now();
      const body = Object.assign(toPushBody(current), extra);
      return await push(kind, id, Object.assign(await buildBody(body), { pushedAt }));
    } catch (err) {
      defaultLog.error(`[demiPush] ${label} push failed`, { error: err.message, stack: err.stack });
      return false;
    }
  });
}

// Every export resolves true when the body landed or there was nothing to send, false when it did
// not. Controllers ignore it — they never await — but a backfill has to know what to retry.
exports.project = function (doc) {
  return mirrorPush('projects', 'project', doc, null, async body => {
    await enrichProject(body);
    return { doc: body };
  });
};

exports.document = function (doc, extra) {
  return mirrorPush('documents', 'document', doc, extra, async body => {
    const lists = await listEntries();
    const labels = {};
    for (const field of LABEL_FIELDS) {
      if (body[field]) {
        const entry = lists.get(String(body[field]));
        labels[field] = (entry && entry.name) || null;
      }
    }
    return { doc: body, labels };
  });
};

exports.recentActivity = function (doc) {
  return mirrorPush('updates', 'recentActivity', doc, null, body => ({ doc: body }));
};

// Kinds that need no lookup: the stored document is the whole payload, read[] included, and DEMI
// derives visibility from it.
function mirror(kind, label) {
  return function (doc, extra) {
    return mirrorPush(kind, label, doc, extra, body => ({ doc: body }));
  };
}

exports.commentPeriod = mirror('commentperiods', 'commentPeriod');
exports.comment = mirror('comments', 'comment');
exports.organization = mirror('organizations', 'organization');
exports.projectNotification = mirror('notifications', 'projectNotification');

// One config document, one id, and `body` is already the payload GET /api/config served — no
// `{ doc }` envelope, because there is no _id here for DEMI to match the path against.
exports.config = function (body) {
  if (!client.configured() || !body) {
    return Promise.resolve(true);
  }
  return serialize('config:public', async () => {
    try {
      return await push('config', 'public', Object.assign({}, body, { pushedAt: Date.now() }));
    } catch (err) {
      defaultLog.error('[demiPush] config push failed', { error: err.message, stack: err.stack });
      return false;
    }
  });
};
