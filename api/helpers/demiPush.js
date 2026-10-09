'use strict';

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const pushClient = require('./pushClient');
const { LEGISLATION_KEYS } = require('./constants');
const { KINDS, PENDING_FIELDS } = require('./demiPushKinds');

const client = pushClient({
  name: 'demiPush',
  baseEnv: 'DEMI_API_BASE',
  keyEnv: 'DEMI_APIM_KEY',
  keyHeader: 'Ocp-Apim-Subscription-Key',
  method: 'PUT',
  onRefused: noteRefusal
});

const LABEL_FIELDS = ['type', 'milestone', 'projectPhase', 'documentAuthorType'];
// Project fields stored as a bare List ref. eagle-public reads `name` off each one and
// `legislation` off the phase to pick its stage rail (assessment-stages.ts); `type` rides along
// for parity with the List row, no consumer reads it today.
const LIST_REF_FIELDS = ['eacDecision', 'currentPhaseName', 'CEAAInvolvement'];

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
  let body;
  if (typeof doc.toObject === 'function') {
    body = doc.toObject();
    // A row read without a clock-stamped date gets "now" from the schema default; DEMI must get what Mongo holds.
    if (typeof doc.$isDefault === 'function') {
      doc.schema.eachPath((path, type) => {
        if (type.instance === 'Date' && !path.includes('.') && body[path] != null && doc.$isDefault(path)) {
          delete body[path];
        }
      });
    }
  } else {
    body = Object.assign({}, doc);
    for (const key of LEGISLATION_KEYS) {
      if (body[key] && typeof body[key] === 'object') {
        body[key] = Object.assign({}, body[key]);
      }
    }
  }
  for (const field of PENDING_FIELDS) {
    delete body[field];
  }
  return body;
}

// DEMI flattens a project out of its legislation block, so per-legislation labels have to land
// inside the block; pins and featuredDocuments are top-level in Mongo and stay there.
async function enrichProject(project) {
  const blocks = LEGISLATION_KEYS.map(key => project[key]).filter(b => b && typeof b === 'object');
  // Older rows can hold one org several times; push each once, in first-seen order.
  const pinIds = Array.isArray(project.pins) ? [...new Set(project.pins.map(idOf).filter(Boolean))] : [];
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
const MODEL_BY_KIND = Object.fromEntries(Object.values(KINDS).map(kind => [kind.route, kind.model]));

const dropped = (kind, id, reason, meta) => pushClient.logDropped('demiPush', `${kind} ${id}`, reason, meta);

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

// Test-only view of the queue: a chain entry left behind means a later push would skip the queue.
exports._pendingCount = () => chains.size;

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
  let doc;
  try {
    doc = await model.findById(id);
  } catch (err) {
    defaultLog.warn(`[demiPush] ${kind} ${id} re-read failed, pushing the caller's copy`, { error: err.message });
    return snapshot;
  }
  if (!doc) {
    // Row is gone, so the snapshot is the last state DEMI can be told about — and on a delete
    // mirror it is the body carrying the marker the row itself never held.
    defaultLog.debug(`[demiPush] ${kind} ${id} gone from Mongo, pushing the caller's copy`);
    return snapshot;
  }
  return doc;
}

// Snapshots that carry nothing but an id, so the stored row is the only body there is.
const idOnly = new WeakSet();

function byId(id) {
  const snapshot = { _id: id };
  idOnly.add(snapshot);
  return snapshot;
}

exports.byId = byId;

function push(kind, id, body) {
  // No /api segment: the APIM machine API's backend already carries it
  return client.push(`/eagle/${kind}/${id}`, body, `${kind} ${id}`);
}

// What a push that did not land can say about why, keyed by push label while it is on the wire.
// serialize() keeps one push per record in flight, so the label is unique while it is here.
const sending = new Map();

// A 404 carries DEMI's refusal code, e.g. PARENT_NOT_FOUND for a child whose parent it lacks.
// Returning false lets pushClient log the drop as usual.
function noteRefusal({ label, code }) {
  const outcome = sending.get(label);
  if (outcome && code) {
    outcome.reason = code;
  }
  return false;
}

const NOT_MIRRORED = 'not mirrored (see push-dropped line)';

// The resolved value stays a bare boolean for the backfill scripts; awaitMirror reads kind, id and
// outcome to name a failure and flag its row.
function labelled(kind, id, promise, outcome) {
  return Object.assign(promise, { kind, id, outcome });
}

// Every mirror runs through here. `extra` says what the stored document cannot: a hard delete
// leaves nothing to re-read, so the caller's own copy carries the marker instead.
function mirrorPush(kind, doc, extra, buildBody) {
  if (!client.configured() || !doc || !doc._id) {
    return Promise.resolve(true);
  }
  const id = doc._id;
  const outcome = { reason: null };
  return labelled(kind, String(id), serialize(`${kind}:${id}`, async () => {
    const label = `${kind} ${id}`;
    try {
      // Taken before the read: only a failure flagged before it is one this push's body covers.
      const readAt = new Date();
      const current = await currentDoc(kind, id, doc);
      // Only a row read back now can clear a flag: the caller's copy may hold one a newer failure replaced.
      if (current !== doc) {
        outcome.readAt = readAt;
        outcome.pending = current.demiPushPending === true;
      }
      // An id-only push has no copy of its own: without the stored row it would blank DEMI's.
      if (current === doc && idOnly.has(doc)) {
        dropped(kind, id, 'failed (no stored row to send)');
        outcome.reason = 'no stored row to send';
        return false;
      }
      // Pods push the same record independently, so DEMI keeps the newest stamp and drops an older body.
      const pushedAt = Date.now();
      const body = Object.assign(toPushBody(current), extra);
      sending.set(label, outcome);
      const landed = await push(kind, id, Object.assign(await buildBody(body), { pushedAt }));
      if (!landed && !outcome.reason) {
        outcome.reason = NOT_MIRRORED;
      }
      return landed;
    } catch (err) {
      dropped(kind, id, 'failed', { error: err.message, stack: err.stack });
      outcome.reason = `failed: ${err.message}`;
      return false;
    } finally {
      sending.delete(label);
    }
  }), outcome);
}

// Every export resolves true when the body landed or there was nothing to send, false when it did
// not. Controllers await it through Actions.sendMirrored; a backfill counts it to know what to retry.
exports.project = function (doc, extra) {
  return mirrorPush('projects', doc, extra, async body => {
    await enrichProject(body);
    return { doc: body };
  });
};

exports.document = function (doc, extra) {
  return mirrorPush('documents', doc, extra, async body => {
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

const asDoc = body => ({ doc: body });

exports.recentActivity = function (doc) {
  return mirrorPush('updates', doc, null, asDoc);
};

// Kinds that need no lookup: the stored document is the whole payload, read[] included, and DEMI
// derives visibility from it.
function mirror(kind) {
  return function (doc, extra) {
    return mirrorPush(kind, doc, extra, asDoc);
  };
}

exports.commentPeriod = mirror('commentperiods');
exports.comment = mirror('comments');
exports.organization = mirror('organizations');
exports.projectNotification = mirror('notifications');

// Comma-separated route segments, read per call so the gate needs no restart to test. The check
// comes first: an unlisted kind costs no Mongo read and no HTTP call.
function optedIn(kind) {
  return (process.env.DEMI_PUSH_OPT_IN_KINDS || '').split(',').some(name => name.trim() === kind);
}

exports.optedIn = optedIn;
exports.configured = () => client.configured();

// updateOne hands back no document, so the row is pushed by id once the write matched it, and the
// push re-reads it for the body.
exports.pushIfMatched = function (pushKind, result, id) {
  if (!result || !result.matchedCount) {
    return Promise.resolve(true);
  }
  return pushKind(byId(id));
};

function optInMirror(kind, buildBody) {
  return function (doc, extra) {
    if (!optedIn(kind)) {
      return Promise.resolve(true);
    }
    return mirrorPush(kind, doc, extra, buildBody);
  };
}

exports.user = optInMirror('users', body => {
  // Legacy User rows can still hold a password hash and salt; neither leaves eagle-api.
  delete body.password;
  delete body.salt;
  return { doc: body };
});
exports.group = optInMirror('groups', asDoc);

// An organization rename rewrites orgName on its users through updateMany, which names no ids, so
// they are looked up here: ids only, and only once the users kind is on.
exports.usersOfOrganization = function (orgId) {
  if (!optedIn('users') || !client.configured()) {
    return Promise.resolve(true);
  }
  const filter = { _schemaName: 'User', org: new mongoose.Types.ObjectId(String(orgId)) };
  const label = `of organization ${orgId}`;
  // The label is no row id, so a failure flags every user of the organization through the filter.
  // A landing clears only the users looked up here: one joining the organization later was not pushed.
  const outcome = { reason: null, filter, readAt: new Date() };
  return labelled('users', label, Promise.resolve(mongoose.model('User').find(filter, '_id demiPushPending').lean())
    .then(users => {
      outcome.pending = users.some(user => user.demiPushPending === true);
      outcome.ids = users.map(user => user._id);
      return Promise.all(users.map(user => exports.user(byId(user._id))));
    })
    .then(results => {
      const landed = results.every(Boolean);
      if (!landed) {
        outcome.reason = NOT_MIRRORED;
      }
      return landed;
    })
    .catch(err => {
      dropped('users', label, 'failed (user lookup failed)', { error: err.message });
      outcome.reason = 'user lookup failed';
      return false;
    }), outcome);
};
exports.inspection = optInMirror('inspections', asDoc);
exports.inspectionElement = optInMirror('inspection-elements', asDoc);
exports.inspectionItem = optInMirror('inspection-items', asDoc);

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
      dropped('config', 'public', 'failed', { error: err.message, stack: err.stack });
      return false;
    }
  });
};

const DEFAULT_AWAIT_MS = 25000;
// setTimeout fires at once for any delay above this.
const MAX_AWAIT_MS = 2147483647;

function awaitMs() {
  const ms = Number(process.env.DEMI_PUSH_AWAIT_MS);
  return Number.isInteger(ms) && ms > 0 && ms <= MAX_AWAIT_MS ? ms : DEFAULT_AWAIT_MS;
}

function failureReason(push) {
  return (push.outcome && push.outcome.reason) || NOT_MIRRORED;
}

// Waits on one push or an array of them, all under one deadline, and never rejects. A push still
// pending at the deadline counts as failed but keeps running in its chain. `landed` and `failures`
// hold only labelled pushes, the ones with a row to flag or clear; `mirrored` counts every push.
exports.awaitMirror = function (pushes) {
  const entries = [].concat(pushes).filter(push => push != null);
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(resolve, awaitMs(), 'timeout');
    timer.unref();
  });
  const reasons = entries.map(push => Promise.race([
    Promise.resolve(push).then(
      landed => (landed === false ? failureReason(push) : null),
      err => `failed: ${(err && err.message) || err}`
    ),
    deadline
  ]));
  return Promise.all(reasons).then(results => {
    clearTimeout(timer);
    const entry = i => {
      const { kind, id, outcome } = entries[i];
      return outcome && outcome.filter ? { kind, id, filter: outcome.filter } : { kind, id };
    };
    // A landing carries readAt only when the row it read was flagged, so an unflagged row costs no clear.
    const landing = i => {
      const { kind, id, outcome } = entries[i];
      if (!outcome || !outcome.pending) {
        return entry(i);
      }
      return outcome.ids ? { kind, id, ids: outcome.ids, readAt: outcome.readAt } : Object.assign(entry(i), { readAt: outcome.readAt });
    };
    const failures = [];
    const landed = [];
    results.forEach((reason, i) => {
      if (!entries[i].kind) {
        return;
      }
      if (reason) {
        failures.push(Object.assign(entry(i), { reason }));
      } else {
        landed.push(landing(i));
      }
    });
    return { mirrored: results.every(reason => !reason), failures, landed };
  });
};

const ERROR_MAX_LENGTH = 200;
const UNSET_PENDING = Object.fromEntries(PENDING_FIELDS.map(field => [field, '']));
// readAt and demiPushFailedAt come from different pods' clocks; a failure this close to the read stays flagged.
const CLOCK_SKEW_MS = 5000;
// The models' write hooks drop the pending fields from any update without this option.
const INTERNAL = { demiPushInternal: true };

// updateOne and updateMany skip the save hooks: no audit row, and _updatedBy and dateUpdated stay put.
function updateRows(model, many, filter, update) {
  return many ? model.updateMany(filter, update, INTERNAL) : model.updateOne(filter, update, INTERNAL);
}

async function markPending(entry, failedAt) {
  const { kind, id, reason } = entry;
  const model = modelFor(kind);
  if (!model || (!entry.filter && !mongoose.isValidObjectId(id))) {
    defaultLog.error(`[demiPush] ${kind} ${id}: no row to flag for the sweep`, { kind, id, reason });
    return;
  }
  const fields = { demiPushPending: true, demiPushFailedAt: failedAt, demiPushError: String(reason).slice(0, ERROR_MAX_LENGTH) };
  try {
    const result = await updateRows(model, Boolean(entry.filter), entry.filter || { _id: id }, { $set: fields });
    if (!entry.filter && !(result && result.matchedCount)) {
      // A hard delete leaves no row, so the sweep cannot resend its delete marker.
      defaultLog.error(`[demiPush] ${kind} ${id}: row gone, nothing for the sweep to retry`, { kind, id, reason });
    }
  } catch (err) {
    defaultLog.error(`[demiPush] ${kind} ${id}: could not flag the row for the sweep: ${err.message}`, { kind, id, reason });
  }
}

// Only a failure flagged before the push read the row is cleared: a later one may be newer than DEMI's body.
async function clearPending(entry) {
  const model = modelFor(entry.kind);
  if (!entry.readAt || !model || (!entry.ids && !mongoose.isValidObjectId(entry.id))) {
    return;
  }
  const filter = Object.assign({}, entry.ids ? { _id: { $in: entry.ids } } : { _id: entry.id }, {
    demiPushPending: true,
    $or: [{ demiPushFailedAt: { $lt: new Date(new Date(entry.readAt).getTime() - CLOCK_SKEW_MS) } }, { demiPushFailedAt: { $exists: false } }]
  });
  try {
    await updateRows(model, Boolean(entry.ids), filter, { $unset: UNSET_PENDING });
  } catch (err) {
    defaultLog.warn(`[demiPush] ${entry.kind} ${entry.id}: could not clear the pending flag: ${err.message}`);
  }
}

/** Writes an awaitMirror result onto the rows: failures flagged for the sweep, landings cleared. Never rejects. */
exports.recordOutcome = function (result, failedAt = new Date()) {
  for (const { kind, id, reason } of result.failures) {
    defaultLog.error(`[demiPush] not-mirrored ${kind} ${id}: ${reason}`, { kind, id, reason });
  }
  return Promise.all([
    ...result.failures.map(entry => markPending(entry, failedAt)),
    ...result.landed.map(clearPending)
  ]);
};
