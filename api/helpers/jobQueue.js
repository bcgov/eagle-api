'use strict';

/**
 * jobQueue.js
 *
 * Agenda-based job queue backed by MongoDB.
 * Uses the existing Mongoose connection so no second DB connection is opened.
 *
 * Multi-pod safety: Agenda claims jobs atomically via findOneAndUpdate
 * ({lockedAt: null}). Only one pod runs each job regardless of how many pods
 * are running. If a pod crashes mid-job, Agenda re-queues after lockLifetime
 * (5 min) so another pod can pick it up.
 *
 * Usage:
 *   const { startJobQueue, getAgenda } = require('./jobQueue');
 *   await startJobQueue();      // call once after mongoose connects
 *   const agenda = getAgenda(); // use anywhere after that
 */

const Agenda  = require('agenda');
const mongoose = require('mongoose');
const { exportProjectDocs } = require('./export-docs-helper');
const defaultLog = require('winston').loggers.get('default');

/** @type {InstanceType<typeof Agenda> | null} */
let agenda = null;

/**
 * Returns the running Agenda instance.
 * Throws if startJobQueue() has not been called yet.
 */
function getAgenda() {
  if (!agenda) throw new Error('[jobQueue] Agenda is not started');
  return agenda;
}

/**
 * Starts the Agenda job queue.
 * Must be called after mongoose.connection is open.
 */
async function startJobQueue() {
  agenda = new Agenda({
    mongo: mongoose.connection.db,
    db: { collection: 'agendaJobs' },
    processEvery: '5 seconds',
    defaultLockLifetime: 5 * 60 * 1000, // 5 min — restart stuck jobs
  });

  // ── Job definitions ────────────────────────────────────────────────────────

  /**
   * project-doc-export
   *
   * Exports all documents for an EPIC project to a CSV string and stores the
   * result back into job.attrs.data.result for later download.
   *
   * data: { projectId: string, includeAll: boolean, requestedBy: string, requestedAt: string }
   */
  agenda.define('project-doc-export', { concurrency: 5 }, async (job) => {
    const { projectId, includeAll } = job.attrs.data;
    defaultLog.info(`[jobQueue] project-doc-export started: projectId=${projectId}`);

    const csv = await exportProjectDocs(mongoose.connection.db, projectId, includeAll);

    // Store result inline in the job document (CSV is typically < 500 KB;
    // well within MongoDB's 16 MB document limit).
    job.attrs.data.result = {
      csv,
      filename: `project-${projectId}.csv`,
    };
    await job.save();

    defaultLog.info(`[jobQueue] project-doc-export completed: projectId=${projectId}`);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // Graceful shutdown — stops processing new jobs and waits for running ones.
  process.once('SIGTERM', async () => {
    try {
      await agenda.stop();
      defaultLog.info('[jobQueue] Agenda stopped (SIGTERM)');
    } catch (err) {
      defaultLog.error('[jobQueue] Error during shutdown:', err.message);
    }
  });

  await agenda.start();
  defaultLog.info('[jobQueue] Agenda started (processEvery=5s)');
}

module.exports = { startJobQueue, getAgenda };
