'use strict';

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const LABEL_FIELDS = ['type', 'milestone', 'projectPhase', 'documentAuthorType'];
const TIMEOUT_MS = 10000;
const ATTEMPTS = 2;

// ponytail: memoized for process lifetime; add a TTL if List items start changing while pods are up
let listNamesPromise = null;

function listNames() {
  if (!listNamesPromise) {
    listNamesPromise = Promise.resolve(mongoose.model('List').find({}, '_id name').lean())
      .then(items => new Map(items.map(i => [String(i._id), i.name])))
      .catch(err => {
        listNamesPromise = null;
        throw err;
      });
  }
  return listNamesPromise;
}

// ponytail: last-writer-wins; sequence per id if the reconcile ever reports ordering drift
async function push(kind, id, body) {
  if (!process.env.DEMI_API_BASE) {
    return;
  }

  const url = `${process.env.DEMI_API_BASE}/api/eagle/${kind}/${id}`;
  let lastErr = null;
  let lastStatus = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.DEMI_API_KEY
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.ok) {
        return;
      }
      lastErr = null;
      lastStatus = res.status;
      if (res.status < 500) {
        break;
      }
    } catch (err) {
      lastErr = err;
      lastStatus = null;
    }
  }

  if (lastErr) {
    defaultLog.error(`[demiPush] ${kind} ${id} failed`, { error: lastErr.message, stack: lastErr.stack });
  } else {
    defaultLog.error(`[demiPush] ${kind} ${id} rejected ${lastStatus}`);
  }
}

exports.push = push;

exports.project = function (doc) {
  return doc && doc._id ? push('projects', doc._id, { doc }) : Promise.resolve();
};

exports.document = async function (doc) {
  if (!process.env.DEMI_API_BASE || !doc || !doc._id) {
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
