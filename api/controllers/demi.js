'use strict';

/**
 * DEMI OCR Intake
 *
 * Accepts a file upload, stages it to disk, and queues an Agenda
 * (MongoDB-backed) demi-extract job. Status polling and result download
 * use the universal /api/jobs endpoints — nothing is tracked here.
 *
 * Protected by Keycloak Bearer auth (sysadmin only).
 *
 * Flow:
 *   POST /api/demi/extract         → stages file, queues job, returns 202 { jobId }
 *   GET  /api/jobs/:jobId          → status + progress (job.js controller)
 *   GET  /api/jobs/:jobId/download → extracted markdown (job.js controller)
 */

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const defaultLog = require('winston').loggers.get('default');
const { getAgenda } = require('../helpers/jobQueue');

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const TEMP_DIR = '/tmp';

/**
 * POST /api/demi/extract
 *
 * Accepts a file upload (multipart/form-data, field name: upfile),
 * stages the file to disk, queues a demi-extract Agenda job, and
 * returns a jobId. Poll status via GET /api/jobs/:jobId.
 * Download result via GET /api/jobs/:jobId/download.
 *
 * Response 202: { jobId: string }
 */
exports.extractDocument = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;
  const file = args.swagger.params.upfile.value;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ message: 'File too large. Maximum size is 100 MB.' });
  }

  // Stage file to disk — the Agenda worker reads it and cleans up
  const stagingId = randomUUID();
  const filePath = path.join(TEMP_DIR, `demi-${stagingId}`);

  try {
    await fs.promises.writeFile(filePath, file.buffer);
  } catch (err) {
    defaultLog.error(`[demi] Failed to stage file: ${err.message}`);
    return res.status(500).json({ message: 'Failed to stage file for processing.' });
  }

  const requestedBy = authPayload?.sub || authPayload?.preferred_username || 'unknown';

  try {
    const agenda = getAgenda();
    const job = await agenda.now('demi-extract', {
      filePath,
      originalFilename: file.originalname,
      fileSize:         file.size,
      requestedBy,
      requestedAt:      new Date().toISOString(),
    });

    defaultLog.info(`[demi] Queued demi-extract job ${job.attrs._id} for "${file.originalname}" (${file.size} bytes)`);
    return res.status(202).json({ jobId: job.attrs._id });
  } catch (err) {
    fs.unlink(filePath, () => {}); // clean up if queue failed
    defaultLog.error(`[demi] Failed to queue extraction job: ${err.message}`);
    return res.status(500).json({ message: 'Failed to queue extraction job.' });
  }
};



