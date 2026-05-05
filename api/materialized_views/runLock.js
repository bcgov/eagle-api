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

  // Atomic compare-and-set: only one concurrent caller can win.
  //
  // findOneAndUpdate with upsert and returnDocument:'before':
  //   - Filter matches (running=false or stale) → updates doc, returns old doc → WE HAVE LOCK
  //   - Filter no-match, doc absent              → upserts new doc, returns null → WE HAVE LOCK (first run)
  //   - Filter no-match, doc present (running)  → upsert throws E11000 (dup key) → LOCK HELD BY OTHER
  let result;
  try {
    result = await col().findOneAndUpdate(
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
  } catch (err) {
    if (err.code === 11000) {
      // Another process holds the lock — upsert collided on _id
      defaultLog.warn(`[mat-view] lock '${lockId}' held by another process — skipping`);
      return false;
    }
    throw err;
  }

  // result === null → upsert fired (first-ever run) → we own the lock
  // result is a doc  → we updated an existing unlocked/stale doc → we own the lock
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
