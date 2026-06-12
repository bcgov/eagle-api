'use strict';

/**
 * DEMI Document Intake
 *
 * The single upload point for EPIC documents via DEMI. Accepts a file upload,
 * persists it to MinIO, creates a canonical Document record (staff-only), and
 * queues a demi-extract Agenda job that extracts text (OCR for scans, via
 * docling/RapidOCR) and writes DocumentChunks for Typesense content search.
 *
 * Protected by Keycloak Bearer auth (sysadmin only).
 *
 * Flow:
 *   POST /api/demi/extract         → uploads to MinIO, creates Document,
 *                                    queues job, returns 202 { jobId, docId }
 *   GET  /api/jobs/:jobId          → status + progress (job.js controller)
 *   GET  /api/jobs/:jobId/download → extracted markdown (job.js controller)
 *
 * Future (designed-around, not built): auto-tagging against the EAO label set
 * with confidence scoring, and a manual-review gate (demiReviewStatus).
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');
const { getAgenda } = require('../helpers/jobQueue');
const MinioController = require('../helpers/minio');
const Utils = require('../helpers/utils');

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const TEMP_DIR = process.env.UPLOAD_DIRECTORY || '/tmp';
const ENABLE_VIRUS_SCANNING = process.env.ENABLE_VIRUS_SCANNING
  ? process.env.ENABLE_VIRUS_SCANNING.toLowerCase() === 'true'
  : false;

/**
 * POST /api/demi/extract
 *
 * Accepts a file upload (multipart/form-data, field name: upfile) plus a
 * required `project` ObjectId. Uploads to MinIO, creates a Document, queues a
 * demi-extract job. Poll status via GET /api/jobs/:jobId.
 *
 * Response 202: { jobId: string, docId: string }
 */
exports.extractDocument = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;
  const file = args.swagger.params.upfile.value;
  const project = args.swagger.params.project && args.swagger.params.project.value;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ message: 'File too large. Maximum size is 100 MB.' });
  }
  if (!project || !mongoose.Types.ObjectId.isValid(project)) {
    return res.status(400).json({ message: 'A valid project id is required.' });
  }

  // Virus scan before anything touches storage
  if (ENABLE_VIRUS_SCANNING) {
    const scanPassed = await Utils.avScan(file.buffer);
    if (!scanPassed) {
      defaultLog.warn('[demi] File failed virus check.');
      return res.status(400).json({ message: 'File failed virus check.' });
    }
  }

  // Stage to a temp file for the MinIO upload (fPutObject reads from disk)
  const tempFilePath = path.join(TEMP_DIR, `demi-upload-${Date.now()}-${file.originalname}`);
  let minioFile;
  try {
    await fs.promises.writeFile(tempFilePath, file.buffer);
    minioFile = await MinioController.putDocument(
      MinioController.BUCKETS.DOCUMENTS_BUCKET, project, file.originalname, tempFilePath
    );
  } catch (err) {
    defaultLog.error(`[demi] MinIO upload failed: ${err.message || err}`);
    return res.status(500).json({ message: 'Failed to store uploaded file.' });
  } finally {
    fs.promises.unlink(tempFilePath).catch(() => {});
  }

  // Create the canonical Document record (staff-only, DEMI-sourced)
  const Document = mongoose.model('Document');
  const doc = new Document();
  doc.project = new mongoose.Types.ObjectId(project);
  doc._addedBy = authPayload?.sub || authPayload?.preferred_username || 'system';
  doc._createdDate = new Date();
  doc.read = ['sysadmin', 'staff'];
  doc.write = ['sysadmin', 'staff'];
  doc.delete = ['sysadmin', 'staff'];

  doc.internalOriginalName = file.originalname;
  doc.internalURL = minioFile.path;
  doc.internalExt = minioFile.extension;
  doc.internalSize = String(file.size);
  doc.internalMime = file.mimetype;
  doc.passedAVCheck = true;

  doc.documentSource = 'DEMI';
  doc.demiReviewStatus = 'unreviewed';   // seam for the future manual-review gate
  doc.displayName = file.originalname;
  doc.documentFileName = file.originalname;
  doc.dateUploaded = new Date();
  doc.datePosted = new Date();
  // type / milestone / labels intentionally unset — future auto-tagger fills them.

  let saved;
  try {
    saved = await doc.save();
  } catch (saveError) {
    defaultLog.error(`[demi] Document save failed, rolling back MinIO: ${saveError.message}`);
    MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, project, minioFile.fullName)
      .catch(() => {});
    return res.status(500).json({ message: 'Failed to create document record.' });
  }

  // Queue extraction — worker pulls the file from MinIO by internalURL
  try {
    const agenda = getAgenda();
    const job = await agenda.now('demi-extract', {
      docId:            String(saved._id),
      internalURL:      saved.internalURL,
      project:          String(project),
      originalFilename: file.originalname,
      fileSize:         file.size,
      requestedBy:      doc._addedBy,
      requestedAt:      new Date().toISOString(),
    });

    defaultLog.info(`[demi] Queued demi-extract job ${job.attrs._id} for doc ${saved._id} ("${file.originalname}", ${file.size} bytes)`);
    return res.status(202).json({ jobId: job.attrs._id, docId: String(saved._id) });
  } catch (err) {
    defaultLog.error(`[demi] Failed to queue extraction job: ${err.message}`);
    // Document + MinIO object remain; the nightly worker is a backstop only for
    // public docs, so surface the failure. Staff can retry or delete.
    return res.status(500).json({ message: 'Document stored but failed to queue extraction.', docId: String(saved._id) });
  }
};
