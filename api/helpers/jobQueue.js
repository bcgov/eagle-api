'use strict';

/**
 * jobQueue.js
 *
 * Agenda-based job queue backed by MongoDB.
 * Agenda opens its own MongoDB connection (driver version mismatch with Mongoose
 * prevents sharing the existing connection). exportProjectDocs still uses
 * mongoose.connection.db for queries.
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

const { Agenda } = require('agenda');
const fs = require('fs');
const mongoose = require('mongoose');
const { dbConnection, credentials } = require('../../app_helper');
const { exportProjectDocs } = require('./export-docs-helper');
const defaultLog = require('winston').loggers.get('default');

/**
 * Build a MongoDB URI that includes credentials if configured.
 * app_helper exports dbConnection (no auth) and credentials separately.
 */
function buildAgendaUri() {
  const { db_username, db_password } = credentials || {};
  if (db_username && db_password) {
    const authSource = process.env.MONGODB_AUTHSOURCE || 'admin';
    // Insert user:pass@ after mongodb:// and append authSource (users live in
    // the admin db, not the app db — must match mongoose_options.js authSource)
    const withAuth = dbConnection.replace(
      'mongodb://',
      `mongodb://${encodeURIComponent(db_username)}:${encodeURIComponent(db_password)}@`
    );
    const sep = withAuth.includes('?') ? '&' : '?';
    return `${withAuth}${sep}authSource=${authSource}`;
  }
  return dbConnection;
}

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
    db: {
      address: buildAgendaUri(),
      collection: 'agendaJobs',
    },
    processEvery: '5 seconds',
    defaultLockLifetime: 5 * 60 * 1000, // 5 min — restart stuck jobs
  });

  // demi-extract jobs can run up to 60min — override lock lifetime per-job below

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

  /**
   * demi-extract
   *
   * Extracts text from a staged document file via eagle-demi (docling-serve).
   * Polls docling-serve internally, updating job progress in MongoDB on each
   * tick so GET /api/jobs/:jobId can report live status.
   *
   * data: { filePath, originalFilename, fileSize, requestedBy, requestedAt }
   * result: { markdown, filename }
   * progress: { doclingStatus, queuePosition, taskMeta }
   */
  agenda.define('demi-extract', { concurrency: 3, lockLifetime: 70 * 60 * 1000 }, async (job) => {
    const { filePath, originalFilename, fileSize } = job.attrs.data;
    const DOCLING_URL = process.env.DOCLING_URL || 'http://eagle-demi:5001';
    const DOCLING_API_KEY = process.env.DOCLING_API_KEY || '';
    const docHeaders = DOCLING_API_KEY ? { 'X-Api-Key': DOCLING_API_KEY } : {};

    defaultLog.info(`[jobQueue] demi-extract started: ${originalFilename} (${fileSize} bytes)`);

    // Read staged file then immediately clean up — don't hold disk on failure
    let fileBuffer;
    try {
      fileBuffer = await fs.promises.readFile(filePath);
    } catch (err) {
      throw new Error(`Failed to read staged file ${filePath}: ${err.message}`);
    } finally {
      fs.unlink(filePath, () => {});
    }

    // Submit to docling-serve async API
    const fd = new FormData();
    fd.append('files', new Blob([fileBuffer], { type: 'application/octet-stream' }), originalFilename);

    const submitRes = await fetch(`${DOCLING_URL}/v1/convert/file/async`, {
      method: 'POST',
      body: fd,
      headers: docHeaders,
      signal: AbortSignal.timeout(60_000),
    });

    if (!submitRes.ok) {
      const text = await submitRes.text().catch(() => '');
      throw new Error(`Docling submit returned ${submitRes.status}: ${text}`);
    }

    const submitData = await submitRes.json();
    const taskId = submitData?.task_id;
    if (!taskId) throw new Error('Docling did not return task_id');

    defaultLog.info(`[jobQueue] demi-extract task_id=${taskId} for ${originalFilename}`);

    // Poll until complete — persist progress to MongoDB on each tick
    const MAX_POLLS = parseInt(process.env.DEMI_MAX_POLLS || '720', 10); // default 60min @ 5s
    for (let i = 0; i < MAX_POLLS; i++) {
      const pollRes = await fetch(`${DOCLING_URL}/v1/status/poll/${taskId}?wait=5`, {
        headers: docHeaders,
        signal: AbortSignal.timeout(15_000),
      });

      if (!pollRes.ok) {
        const text = await pollRes.text().catch(() => '');
        throw new Error(`Docling poll returned ${pollRes.status}: ${text}`);
      }

      const poll = await pollRes.json();
      const doclingStatus = poll?.task_status;

      job.attrs.data.progress = {
        doclingStatus,
        queuePosition: poll?.task_position ?? null,
        taskMeta:      poll?.task_meta     ?? null,
      };
      await job.save();

      if (doclingStatus === 'failure') {
        throw new Error(`Docling extraction failed (task_id=${taskId})`);
      }
      if (doclingStatus === 'success') break;

      if (i === MAX_POLLS - 1) {
        throw new Error(`Docling extraction timed out after ${MAX_POLLS} polls`);
      }
    }

    // Fetch the converted result
    const resultRes = await fetch(`${DOCLING_URL}/v1/result/${taskId}`, {
      headers: docHeaders,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resultRes.ok) {
      const text = await resultRes.text().catch(() => '');
      throw new Error(`Docling result endpoint returned ${resultRes.status}: ${text}`);
    }

    const resultData = await resultRes.json();
    const markdown = resultData?.document?.md_content || '';

    job.attrs.data.result = {
      markdown,
      filename: originalFilename.replace(/\.[^.]+$/, '') + '.md',
    };
    job.attrs.data.progress.doclingStatus = 'success';
    await job.save();

    defaultLog.info(`[jobQueue] demi-extract done: ${originalFilename} — ${markdown.length} chars`);
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
