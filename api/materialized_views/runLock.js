'use strict';

const mongoose = require('mongoose');

const LOCK_COLLECTION = '_system_locks';
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Attempt to acquire a named execution lock stored in MongoDB.
 * Returns true if the lock was acquired, false if it is already held.
 *
 * A lock is considered stale (and therefore acquirable) when the holding
 * process has not released it within STALE_THRESHOLD_MS, which indicates
 * an unclean exit.
 *
 * @param {string} lockId
 * @param {object} defaultLog - winston logger
 * @returns {Promise<boolean>}
 */
async function acquireLock(lockId, defaultLog) {
  const collection = mongoose.connection.db.collection(LOCK_COLLECTION);
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

  const existing = await collection.findOne({ _id: lockId });
  if (existing && existing.running && existing.startedAt > staleThreshold) {
    defaultLog.warn(
      `[mat-view] lock '${lockId}' already held since ${existing.startedAt.toISOString()} — skipping run`
    );
    return false;
  }

  if (existing && existing.running) {
    defaultLog.warn(
      `[mat-view] lock '${lockId}' was stale (held since ${existing.startedAt.toISOString()}) — forcing acquisition`
    );
  }

  await collection.updateOne(
    { _id: lockId },
    { $set: { running: true, startedAt: now } },
    { upsert: true }
  );

  return true;
}

/**
 * Release a named execution lock.
 * Errors are swallowed and logged — a lock release failure must never
 * crash the calling process.
 *
 * @param {string} lockId
 * @param {object} defaultLog - winston logger
 */
async function releaseLock(lockId, defaultLog) {
  try {
    const collection = mongoose.connection.db.collection(LOCK_COLLECTION);
    await collection.updateOne({ _id: lockId }, { $set: { running: false } });
  } catch (err) {
    defaultLog.error(`[mat-view] failed to release lock '${lockId}': ${err.message}`);
  }
}

module.exports = { acquireLock, releaseLock };
