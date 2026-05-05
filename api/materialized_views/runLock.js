'use strict';

const os = require('os');
const mongoose = require('mongoose');

const LOCK_COLLECTION = '_system_locks';
const STALE_MS = 60 * 60 * 1000; // 60 minutes

const col = () => mongoose.connection.db.collection(LOCK_COLLECTION);
const staleThreshold = () => new Date(Date.now() - STALE_MS);

async function acquireLock(lockId, defaultLog) {
  const now = new Date();
  const existing = await col().findOne({ _id: lockId });

  if (existing && existing.running) {
    if (existing.startedAt > staleThreshold()) {
      defaultLog.warn(`[mat-view] lock '${lockId}' held since ${existing.startedAt.toISOString()} — skipping`);
      return false;
    }
    defaultLog.warn(`[mat-view] lock '${lockId}' stale since ${existing.startedAt.toISOString()} — taking over`);
  }

  await col().updateOne(
    { _id: lockId },
    { $set: { running: true, startedAt: now, hostname: os.hostname() } },
    { upsert: true }
  );
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
