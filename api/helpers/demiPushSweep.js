'use strict';

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const demiPush = require('./demiPush');
const { KINDS } = require('./demiPushKinds');

// 150 pushes a minute, the demi-repush default: the APIM subscription is shared with the live pods.
const DEFAULT_MIN_INTERVAL_MS = 400;

function enabled(kind) {
  return demiPush.configured() && (!kind.optIn || demiPush.optedIn(kind.optIn));
}

async function sweepPush(kind, id, send, counts) {
  try {
    const result = await demiPush.awaitMirror(send());
    await demiPush.recordOutcome(result);
    counts[result.mirrored ? 'pushed' : 'failed']++;
  } catch (err) {
    counts.failed++;
    defaultLog.error(`[demi-push-sweep] ${kind.route} ${id}: ${err.message}`);
  }
}

function pacer(minIntervalMs) {
  let nextAt = 0;
  return async () => {
    const wait = nextAt - Date.now();
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    nextAt = Date.now() + minIntervalMs;
  };
}

async function sweepKind(kind, limitPerKind, pace) {
  const counts = { found: 0, pushed: 0, failed: 0 };
  let rows;
  try {
    rows = await mongoose.model(kind.model)
      .find({ _schemaName: kind.schemaName, demiPushPending: true })
      .sort({ demiPushFailedAt: 1 })
      .limit(limitPerKind)
      .select('_id')
      .lean();
  } catch (err) {
    defaultLog.error(`[demi-push-sweep] ${kind.route}: pending rows could not be read: ${err.message}`);
    return Object.assign(counts, { unreadable: true });
  }
  counts.found = rows.length;
  // One at a time, so each push gets the whole awaitMirror deadline instead of queueing behind the rest.
  for (const row of rows) {
    await pace();
    // By id: a row deleted since the find drops as "no stored row to send" instead of being re-created.
    await sweepPush(kind, row._id, () => demiPush[kind.push](demiPush.byId(row._id)), counts);
  }
  return counts;
}

// Hard deletes whose push did not land. recordOutcome drops the tombstone once DEMI takes the delete
// and rewrites its failedAt and error when it does not.
async function drainTombstones(kinds, limitPerKind, pace) {
  const counts = { found: 0, pushed: 0, failed: 0 };
  for (const kind of kinds) {
    let tombstones;
    try {
      tombstones = await mongoose.model('DemiPushTombstone')
        .find({ kind: kind.route })
        .sort({ failedAt: 1 })
        .limit(limitPerKind)
        .lean();
    } catch (err) {
      defaultLog.error(`[demi-push-sweep] ${kind.route}: failed deletes could not be read: ${err.message}`);
      counts.unreadable = true;
      continue;
    }
    counts.found += tombstones.length;
    for (const { targetId, body } of tombstones) {
      await pace();
      await sweepPush(kind, targetId, () => demiPush[kind.push](Object.assign({}, body, { _id: targetId }), { isDeleted: true }), counts);
    }
  }
  return counts;
}

/**
 * Re-pushes rows whose DEMI push did not land, then resends hard deletes that did not, oldest failure
 * first, parents before children, one push started per `minIntervalMs`. Returns
 * `{ <kind>: counts, tombstones: counts }` for the kinds that push, counts being
 * `{ found, pushed, failed[, unreadable] }`. Never rejects.
 */
exports.sweep = async function ({ limitPerKind = 500, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = {}) {
  const pace = pacer(minIntervalMs);
  const summary = {};
  const kinds = Object.entries(KINDS).filter(([, kind]) => enabled(kind));
  for (const [name, kind] of kinds) {
    summary[name] = await sweepKind(kind, limitPerKind, pace);
  }
  if (kinds.length) {
    summary.tombstones = await drainTombstones(kinds.map(([, kind]) => kind), limitPerKind, pace);
  }
  defaultLog.info(`[demi-push-sweep] done ${JSON.stringify(summary)}`, summary);
  return summary;
};
