'use strict';

const os = require('os');
const mongoose = require('mongoose');

const LOCK_COLLECTION = '_system_locks';
const STALE_MS = 60 * 60 * 1000; // 60 minutes

const col = () => mongoose.connection.db.collection(LOCK_COLLECTION);
const staleThreshold = () => new Date(Date.now() - STALE_MS);

async function acquireLock(lockId, defaultLog) {
  const now = new Date();
  const stale = staleThreshold();

  // Atomic: only set running=true if not already running, or if lock is stale.
  // findOneAndUpdate with a filter ensures only one concurrent caller wins.
  const result = await col().findOneAndUpdate(
    {
      _id: lockId,
      $or: [
        { running: { $ne: true } },
        { startedAt: { $lte: stale } },
      ],
    },
    { $set: { running: true, startedAt: now, hostname: os.hostname() } },
    { upsert: true, returnDocument: 'before' }
  );

  if (result === null) {
    // Document existed and did NOT match the filter → locked by another process
    const existing = await col().findOne({ _id: lockId });
    defaultLog.warn(`[mat-view] lock '${lockId}' held since ${existing && existing.startedAt ? existing.startedAt.toISOString() : 'unknown'} — skipping`);
    return false;
  }

  if (result && result.running && result.startedAt <= stale) {
    defaultLog.warn(`[mat-view] lock '${lockId}' stale since ${result.startedAt.toISOString()} — taking over`);
  }

  return true;
}

// stats: optional { durationMs, succeeded[], failed[] } — written to lastRun field
async function releaseLock(lockId, defaultLog, stats) {
  try {
    const update = { running: false };
    if (stats) {
      update.lastRun = {
        completedAt: new Date(),
        durationMs: stats.durationMs || 0,
        succeeded: stats.succeeded || [],
        failed: stats.failed || [],
      };
    }
    await col().updateOne({ _id: lockId }, { $set: update });
  } catch (err) {
    defaultLog.error(`[mat-view] failed to release lock '${lockId}': ${err.message}`);
  }
}

async function isLocked(lockId) {
  const lock = await col().findOne({ _id: lockId });
  return !!(lock && lock.running && lock.startedAt > staleThreshold());
}

async function getLockInfo(lockId) {
  const lock = await col().findOne({ _id: lockId });
  if (!lock) return { running: false };
  const stale = lock.running && lock.startedAt <= staleThreshold();
  return {
    running: lock.running && !stale,
    stale,
    startedAt: lock.startedAt || null,
    lastRun: lock.lastRun || null,
  };
}

async function forceRelease(lockId, defaultLog) {
  try {
    await col().updateOne({ _id: lockId }, { $set: { running: false } });
    defaultLog.warn(`[mat-view] lock '${lockId}' force-released`);
  } catch (err) {
    defaultLog.error(`[mat-view] failed to force-release lock '${lockId}': ${err.message}`);
  }
}

module.exports = { acquireLock, releaseLock, isLocked, getLockInfo, forceRelease };
