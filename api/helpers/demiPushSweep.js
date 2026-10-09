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

async function sweepRow(kind, id, counts) {
  try {
    // By id: a row deleted since the find drops as "no stored row to send" instead of being re-created.
    const result = await demiPush.awaitMirror(demiPush[kind.push](demiPush.byId(id)));
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
    await sweepRow(kind, row._id, counts);
  }
  return counts;
}

/**
 * Re-pushes rows whose DEMI push did not land, oldest failure first, parents before children, one
 * push started per `minIntervalMs`. Returns `{ <kind>: { found, pushed, failed[, unreadable] } }` for
 * the kinds that push. Never rejects.
 */
exports.sweep = async function ({ limitPerKind = 500, minIntervalMs = DEFAULT_MIN_INTERVAL_MS } = {}) {
  const pace = pacer(minIntervalMs);
  const summary = {};
  for (const [name, kind] of Object.entries(KINDS)) {
    if (enabled(kind)) {
      summary[name] = await sweepKind(kind, limitPerKind, pace);
    }
  }
  defaultLog.info(`[demi-push-sweep] done ${JSON.stringify(summary)}`, summary);
  return summary;
};
