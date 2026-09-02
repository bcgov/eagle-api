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

// ponytail: memoized for process lifetime; add a TTL if List items start changing while pods are up
let listNamesPromise = null;

function listNames() {
  if (!listNamesPromise) {
    listNamesPromise = Promise.resolve(mongoose.model('List').find({ _schemaName: 'List' }, '_id name').lean())
      .then(items => new Map(items.map(i => [String(i._id), i.name])))
      .catch(err => {
        listNamesPromise = null;
        throw err;
      });
  }
  return listNamesPromise;
}

// ponytail: last-writer-wins; sequence per id if the reconcile ever reports ordering drift
function push(kind, id, body) {
  // No /api segment: the APIM machine API's backend already carries it
  return client.push(`/eagle/${kind}/${id}`, body, `${kind} ${id}`);
}

exports.project = function (doc) {
  return doc && doc._id ? push('projects', doc._id, { doc }) : Promise.resolve();
};

exports.document = async function (doc) {
  if (!client.configured() || !doc || !doc._id) {
    return;
  }
  try {
    const names = await listNames();
    const labels = {};
    for (const field of LABEL_FIELDS) {
      if (doc[field]) {
        labels[field] = names.get(String(doc[field])) || null;
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
