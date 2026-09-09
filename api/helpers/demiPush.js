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

// A mirror push re-reads the stored document after the write. A miss or a failed read leaves DEMI
// on the pre-write state, so it is logged; the caller's own HTTP response is unaffected.
exports.freshDoc = async function (model, id) {
  try {
    const doc = await model.findById(id);
    if (!doc) {
      defaultLog.warn(`[demiPush] skipping push: ${model.modelName} ${id} not found on re-read`);
    }
    return doc;
  } catch (err) {
    defaultLog.warn(`[demiPush] skipping push: ${model.modelName} ${id} re-read failed`, { error: err.message });
    return null;
  }
};

// ponytail: last-writer-wins; sequence per id if the reconcile ever reports ordering drift
function push(kind, id, body) {
  // No /api segment: the APIM machine API's backend already carries it
  return client.push(`/eagle/${kind}/${id}`, body, `${kind} ${id}`);
}

// Every export resolves true when the body landed or there was nothing to send, false when it did
// not. Controllers ignore it — they never await — but a backfill has to know what to retry.
exports.project = async function (doc) {
  if (!client.configured() || !doc || !doc._id) {
    return true;
  }
  try {
    const body = toPushBody(doc);
    await enrichProject(body);
    return await push('projects', doc._id, { doc: body });
  } catch (err) {
    defaultLog.error('[demiPush] project push failed', { error: err.message, stack: err.stack });
    return false;
  }
};

// `extra` says what the stored document cannot, as it does for the mirrors below: a hard delete
// leaves nothing to re-read. Without it the body stays the caller's own document, untouched.
exports.document = async function (doc, extra) {
  if (!client.configured() || !doc || !doc._id) {
    return true;
  }
  try {
    const lists = await listEntries();
    const labels = {};
    for (const field of LABEL_FIELDS) {
      if (doc[field]) {
        const entry = lists.get(String(doc[field]));
        labels[field] = (entry && entry.name) || null;
      }
    }
    return await push('documents', doc._id, { doc: extra ? Object.assign(toPushBody(doc), extra) : doc, labels });
  } catch (err) {
    defaultLog.error('[demiPush] document push failed', { error: err.message, stack: err.stack });
    return false;
  }
};

exports.recentActivity = function (doc) {
  return doc && doc._id ? push('updates', doc._id, { doc }) : Promise.resolve(true);
};

// Kinds that need no lookup: the stored document is the whole payload, read[] included, and DEMI
// derives visibility from it. `extra` carries what the stored document cannot say, e.g. a hard
// delete, which leaves nothing to re-read. Callers never await, so nothing may reject.
function mirror(kind, label) {
  return async function (doc, extra) {
    if (!client.configured() || !doc || !doc._id) {
      return true;
    }
    try {
      return await push(kind, doc._id, { doc: Object.assign(toPushBody(doc), extra) });
    } catch (err) {
      defaultLog.error(`[demiPush] ${label} push failed`, { error: err.message, stack: err.stack });
      return false;
    }
  };
}

exports.commentPeriod = mirror('commentperiods', 'commentPeriod');
exports.comment = mirror('comments', 'comment');
exports.organization = mirror('organizations', 'organization');
exports.projectNotification = mirror('notifications', 'projectNotification');

// One config document, one id, and `body` is already the payload GET /api/config served — no
// `{ doc }` envelope, because there is no _id here for DEMI to match the path against.
exports.config = async function (body) {
  if (!client.configured() || !body) {
    return true;
  }
  try {
    return await push('config', 'public', body);
  } catch (err) {
    defaultLog.error('[demiPush] config push failed', { error: err.message, stack: err.stack });
    return false;
  }
};
