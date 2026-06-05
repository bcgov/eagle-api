'use strict';

/**
 * DEMI OCR Proxy
 *
 * Demo/testing endpoint. Accepts a file upload, submits it to the
 * eagle-demi docling-serve pod asynchronously, and returns a jobId
 * for polling. Nothing is stored — result is returned directly to the
 * caller when the job completes.
 *
 * Protected by Keycloak Bearer auth (staff/sysadmin only).
 *
 * Flow:
 *   POST /api/demi/extract        → submits file, returns 202 { jobId }
 *   GET  /api/demi/jobs/:jobId    → polls status, returns { status, queuePosition, markdown? }
 */

const { randomUUID } = require('crypto');
const defaultLog = require('winston').loggers.get('default');

const DOCLING_URL = process.env.DOCLING_URL || 'http://eagle-demi:5001';
const DOCLING_API_KEY = process.env.DOCLING_API_KEY || '';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// In-memory job store: jobId → { taskId, createdAt }
// Scoped to this process — fine for a demo feature.
// Entries expire after 2 hours; pruned lazily on each new submission.
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const jobStore = new Map();

function pruneExpiredJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobStore) {
    if (job.createdAt < cutoff) jobStore.delete(jobId);
  }
}

function doclingHeaders() {
  const h = {};
  if (DOCLING_API_KEY) h['X-Api-Key'] = DOCLING_API_KEY;
  return h;
}

/**
 * POST /api/demi/extract
 *
 * Accepts a file upload (multipart/form-data, field name: upfile),
 * submits it to docling-serve async endpoint, and returns a jobId.
 *
 * Response 202: { jobId: string }
 */
exports.extractDocument = async function (args, res) {
  const file = args.swagger.params.upfile.value;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ message: 'File too large. Maximum size is 100 MB.' });
  }

  const targetUrl = `${DOCLING_URL}/v1/convert/file/async`;
  defaultLog.info(`[demi] Submitting "${file.originalname}" (${file.size} bytes) to ${targetUrl}`);

  let response;
  try {
    const fd = new FormData();
    fd.append('files', new Blob([file.buffer], { type: file.mimetype }), file.originalname);

    response = await fetch(targetUrl, {
      method: 'POST',
      body: fd,
      headers: doclingHeaders(),
      signal: AbortSignal.timeout(60_000), // 60s — file upload + queue hand-off only
    });
  } catch (err) {
    defaultLog.error(`[demi] Failed to reach docling-serve: ${err.message}`);
    return res.status(502).json({ message: 'Could not connect to extraction service. Is eagle-demi running?' });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    defaultLog.error(`[demi] docling-serve async submit returned ${response.status}: ${text}`);
    return res.status(502).json({ message: `Extraction service returned ${response.status}.` });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    defaultLog.error(`[demi] docling-serve async response is not JSON: ${err.message}`);
    return res.status(502).json({ message: 'Unexpected response from extraction service.' });
  }

  const taskId = data?.task_id;
  if (!taskId) {
    defaultLog.error(`[demi] docling-serve async response missing task_id: ${JSON.stringify(data)}`);
    return res.status(502).json({ message: 'Extraction service did not return a task ID.' });
  }

  pruneExpiredJobs();
  const jobId = randomUUID();
  jobStore.set(jobId, { taskId, createdAt: Date.now() });
  defaultLog.info(`[demi] Job ${jobId} → docling task ${taskId}`);

  return res.status(202).json({ jobId });
};

/**
 * GET /api/demi/jobs/:jobId
 *
 * Polls docling-serve for task status. When complete, fetches the
 * result and returns the extracted markdown.
 *
 * Response 200: { status: 'pending'|'started'|'success'|'failure', queuePosition: number|null, markdown?: string }
 */
exports.getJobStatus = async function (args, res) {
  const jobId = args.swagger.params.jobId.value;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ message: 'Job not found or expired.' });
  }

  // Poll with wait=2 — docling holds request up to 2s if still pending,
  // returning immediately when status changes. Cuts round trips.
  const pollUrl = `${DOCLING_URL}/v1/status/poll/${job.taskId}?wait=2`;

  let pollResponse;
  try {
    pollResponse = await fetch(pollUrl, {
      headers: doclingHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    defaultLog.error(`[demi] Status poll failed for task ${job.taskId}: ${err.message}`);
    return res.status(502).json({ message: 'Could not reach extraction service for status.' });
  }

  if (pollResponse.status === 404) {
    jobStore.delete(jobId);
    return res.status(404).json({ message: 'Job not found in extraction service.' });
  }

  if (!pollResponse.ok) {
    const text = await pollResponse.text().catch(() => '');
    defaultLog.error(`[demi] Poll returned ${pollResponse.status}: ${text}`);
    return res.status(502).json({ message: `Status poll returned ${pollResponse.status}.` });
  }

  let pollData;
  try {
    pollData = await pollResponse.json();
  } catch (err) {
    return res.status(502).json({ message: 'Unexpected status response from extraction service.' });
  }

  const status = pollData?.task_status;
  const queuePosition = pollData?.task_position ?? null;

  if (status === 'failure') {
    jobStore.delete(jobId);
    defaultLog.warn(`[demi] Job ${jobId} (task ${job.taskId}) failed`);
    return res.status(200).json({ status: 'failure', queuePosition: null });
  }

  if (status !== 'success') {
    // pending or started — client should keep polling
    return res.status(200).json({ status, queuePosition });
  }

  // Fetch the actual result now that task is complete
  const resultUrl = `${DOCLING_URL}/v1/result/${job.taskId}`;
  let resultResponse;
  try {
    resultResponse = await fetch(resultUrl, {
      headers: doclingHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    defaultLog.error(`[demi] Result fetch failed for task ${job.taskId}: ${err.message}`);
    return res.status(502).json({ message: 'Extraction complete but could not fetch result.' });
  }

  if (!resultResponse.ok) {
    const text = await resultResponse.text().catch(() => '');
    defaultLog.error(`[demi] Result endpoint returned ${resultResponse.status}: ${text}`);
    return res.status(502).json({ message: `Result endpoint returned ${resultResponse.status}.` });
  }

  let resultData;
  try {
    resultData = await resultResponse.json();
  } catch (err) {
    return res.status(502).json({ message: 'Unexpected result response from extraction service.' });
  }

  const markdown = resultData?.document?.md_content || '';
  jobStore.delete(jobId);
  defaultLog.info(`[demi] Job ${jobId} complete — ${markdown.length} chars`);

  return res.status(200).json({ status: 'success', queuePosition: null, markdown });
};

