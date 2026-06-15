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
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { dbConnection, credentials } = require('../../app_helper');
const { exportProjectDocs } = require('./export-docs-helper');
const MinioController = require('./minio');
const documentChunker = require('./documentChunker');
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
   * Extracts text from a DEMI-ingested document via eagle-demi (docling-serve).
   * The file is pulled from MinIO by the Document's internalURL. Large PDFs are
   * pre-split into 10-page batches (pdf-lib) and each batch is sent to
   * docling-serve's SYNCHRONOUS /v1/convert/file endpoint one at a time, keeping
   * per-batch memory bounded regardless of document size. Markdown from each
   * batch is concatenated in order. Non-PDF inputs are sent whole; a PDF that
   * pdf-lib cannot parse falls back to a single whole-file send.
   *
   * The assembled markdown is written to disk (for /jobs/:id/download) and
   * chunked into DocumentChunk records (for Typesense content search). The
   * Document is marked contentExtracted.
   *
   * data: { docId, internalURL, project, originalFilename, fileSize, requestedBy }
   * result: { resultPath, filename, docId, chunkCount }
   * progress: { batch, totalBatches }
   */
  agenda.define('demi-extract', { concurrency: 3, lockLifetime: 70 * 60 * 1000 }, async (job) => {
    const { docId, internalURL, originalFilename, fileSize } = job.attrs.data;
    const jobId = String(job.attrs._id);
    const DOCLING_URL = process.env.DOCLING_URL || 'http://eagle-demi:5001';
    const DOCLING_API_KEY = process.env.DOCLING_API_KEY || '';
    const docHeaders = DOCLING_API_KEY ? { 'X-Api-Key': DOCLING_API_KEY } : {};
    // Wall-clock timeout: default 90 min for large scanned PDFs on CPU
    const TIMEOUT_MS = parseInt(process.env.DEMI_TIMEOUT_MINUTES || '90', 10) * 60 * 1000;
    // Result written to disk — avoids storing large markdown blobs in MongoDB
    const RESULT_DIR = process.env.DEMI_RESULT_DIR || '/tmp';
    const resultPath = path.join(RESULT_DIR, `demi-result-${jobId}.md`);

    defaultLog.info(`[jobQueue] demi-extract started: doc ${docId} ${originalFilename} (${fileSize} bytes)`);

    // Pull the file from MinIO by the Document's internalURL
    let fileBuffer;
    try {
      fileBuffer = await MinioController.getObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, internalURL);
    } catch (err) {
      await documentChunker.markDocument(mongoose.connection.db, docId, 0, `MinIO download failed: ${err.message}`).catch(() => {});
      throw new Error(`Failed to download ${internalURL} from MinIO: ${err.message}`);
    }

    // Per-batch synchronous convert. Timeout must exceed docling-serve's
    // DOCLING_SERVE_MAX_SYNC_WAIT (280s) so the server response is received
    // before the client aborts.
    const BATCH_PAGES = parseInt(process.env.DEMI_BATCH_PAGES || '10', 10);
    const BATCH_TIMEOUT_MS = parseInt(process.env.DEMI_BATCH_TIMEOUT_MS || '295000', 10);
    const deadline = Date.now() + TIMEOUT_MS;

    /** POST one buffer to the sync convert endpoint, return its markdown. */
    async function convertBufferSync(buffer, name) {
      const fd = new FormData();
      fd.append('files', new Blob([buffer], { type: 'application/octet-stream' }), name);
      fd.append('options', JSON.stringify({ to_formats: ['md'], return_as_file: false }));
      const res = await fetch(`${DOCLING_URL}/v1/convert/file`, {
        method: 'POST',
        body: fd,
        headers: docHeaders,
        signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Docling convert returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      const md = json?.document?.md_content || json?.documents?.[0]?.md_content || '';
      if (!md) throw new Error('Docling convert returned empty markdown');
      return md;
    }

    // Attempt to parse PDFs for pre-splitting; non-PDFs and unparseable PDFs
    // are sent whole.
    const isPdf = /\.pdf$/i.test(originalFilename);
    let srcPdf = null;
    if (isPdf) {
      try {
        srcPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      } catch (err) {
        defaultLog.warn(`[jobQueue] demi-extract: pdf-lib parse failed for ${originalFilename} (${err.message}); sending whole file`);
        srcPdf = null;
      }
    }

    let markdown;
    if (srcPdf) {
      const pageCount = srcPdf.getPageCount();
      const totalBatches = Math.max(1, Math.ceil(pageCount / BATCH_PAGES));
      const baseName = originalFilename.replace(/\.[^.]+$/, '');
      const parts = [];

      for (let b = 0; b < totalBatches; b++) {
        if (Date.now() > deadline) {
          throw new Error(`Docling extraction timed out after ${Math.round(TIMEOUT_MS / 60_000)} minutes at batch ${b + 1}/${totalBatches}`);
        }
        const start = b * BATCH_PAGES;
        const end = Math.min(start + BATCH_PAGES, pageCount);
        const indices = Array.from({ length: end - start }, (_, i) => start + i);

        const batchDoc = await PDFDocument.create();
        const copied = await batchDoc.copyPages(srcPdf, indices);
        copied.forEach((p) => batchDoc.addPage(p));
        const batchBuf = Buffer.from(await batchDoc.save());

        const md = await convertBufferSync(batchBuf, `${baseName}-batch${b + 1}.pdf`);
        parts.push(md);

        job.attrs.data.progress = { batch: b + 1, totalBatches };
        await job.save();
        defaultLog.debug(`[jobQueue] demi-extract: ${originalFilename} batch ${b + 1}/${totalBatches} (${md.length} chars)`);
      }
      markdown = parts.join('\n\n');
    } else {
      markdown = await convertBufferSync(fileBuffer, originalFilename);
    }
    // Free the buffer — extraction complete
    fileBuffer = null;

    // Write markdown to disk — keeps MongoDB document small regardless of output size
    await fs.promises.mkdir(RESULT_DIR, { recursive: true });
    await fs.promises.writeFile(resultPath, markdown, 'utf8');

    // Persist DocumentChunks for Typesense content search and mark the Document.
    let chunkCount = 0;
    try {
      const db = mongoose.connection.db;
      const doc = await db.collection('epic').findOne({ _id: new mongoose.Types.ObjectId(docId) });
      if (!doc) throw new Error(`Document ${docId} not found`);
      const listLookup = await documentChunker.buildListLookup(db);
      let projectName;
      if (doc.project) {
        const proj = await db.collection('epic').findOne(
          { _id: doc.project },
          { projection: {
            name: 1, displayName: 1,
            currentLegislationYear: 1,
            legislation_2018: 1, legislation_2002: 1, legislation_1996: 1
          }}
        );
        if (proj) {
          const legKey = proj.currentLegislationYear || 'legislation_2018';
          const leg = proj[legKey] || proj.legislation_2018 || proj.legislation_2002 || proj.legislation_1996 || {};
          projectName = leg.name || leg.shortName || proj.name || proj.displayName || '';
        }
      }
      chunkCount = await documentChunker.writeChunks(db, docId, doc, markdown, projectName, listLookup);
      await documentChunker.markDocument(db, docId, chunkCount, null);
    } catch (err) {
      defaultLog.error(`[jobQueue] demi-extract: chunk persistence failed for doc ${docId}: ${err.message}`);
      await documentChunker.markDocument(mongoose.connection.db, docId, 0, err.message).catch(() => {});
      throw err;
    }

    job.attrs.data.result = {
      resultPath,
      filename: originalFilename.replace(/\.[^.]+$/, '') + '.md',
      docId,
      chunkCount,
    };
    job.attrs.data.progress = { ...(job.attrs.data.progress || {}), done: true };
    await job.save();

    defaultLog.info(`[jobQueue] demi-extract done: doc ${docId} ${originalFilename} — ${markdown.length} chars, ${chunkCount} chunks → ${resultPath}`);
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
