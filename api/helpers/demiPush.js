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
const LEGISLATION_KEYS = ['legislation_1996', 'legislation_2002', 'legislation_2018'];

// ponytail: memoized for process lifetime; add a TTL if List items start changing while pods are up
let listEntriesPromise = null;

function listEntries() {
  if (!listEntriesPromise) {
    listEntriesPromise = Promise.resolve(mongoose.model('List').find({ _schemaName: 'List' }, '_id name item').lean())
      .then(items => new Map(items.map(i => [String(i._id), i])))
      .catch(err => {
        listEntriesPromise = null;
        throw err;
      });
  }
  return listEntriesPromise;
}

// An ObjectId, a hex string or an already-populated subdocument, as a plain id string.
function idOf(value) {
  if (!value) {
    return null;
  }
  return typeof value === 'object' && value._id ? String(value._id) : String(value);
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

  const [lists, orgs] = await Promise.all([
    blocks.some(b => b.applicableRegulation) ? listEntries() : new Map(),
    orgsById(Array.from(orgIds))
  ]);

  for (const block of blocks) {
    block.applicableRegulation = regulationOf(block.applicableRegulation, lists);
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
}

// ponytail: last-writer-wins; sequence per id if the reconcile ever reports ordering drift
function push(kind, id, body) {
  // No /api segment: the APIM machine API's backend already carries it
  return client.push(`/eagle/${kind}/${id}`, body, `${kind} ${id}`);
}

exports.project = async function (doc) {
  if (!client.configured() || !doc || !doc._id) {
    return;
  }
  try {
    const body = toPushBody(doc);
    await enrichProject(body);
    await push('projects', doc._id, { doc: body });
  } catch (err) {
    defaultLog.error('[demiPush] project push failed', { error: err.message, stack: err.stack });
  }
};

exports.document = async function (doc) {
  if (!client.configured() || !doc || !doc._id) {
    return;
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
    await push('documents', doc._id, { doc, labels });
  } catch (err) {
    defaultLog.error('[demiPush] document push failed', { error: err.message, stack: err.stack });
  }
};

exports.recentActivity = function (doc) {
  return doc && doc._id ? push('updates', doc._id, { doc }) : Promise.resolve();
};
