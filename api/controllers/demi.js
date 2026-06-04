'use strict';

/**
 * DEMI OCR Proxy
 *
 * Demo/testing endpoint. Accepts a file upload, forwards it to the
 * eagle-demi docling-serve pod, and returns extracted markdown text.
 * Nothing is stored — result is returned directly to the caller.
 *
 * Protected by Keycloak Bearer auth (staff/sysadmin only).
 */

const defaultLog = require('winston').loggers.get('default');

const DOCLING_URL = process.env.DOCLING_URL || 'http://eagle-demi:5001';
const DOCLING_API_KEY = process.env.DOCLING_API_KEY || '';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/demi/extract
 *
 * Accepts a file upload (multipart/form-data, field name: upfile),
 * forwards it to docling-serve /v1/convert/file, and returns the
 * extracted markdown content.
 *
 * Response: { markdown: string }
 */
exports.extractDocument = async function (args, res) {
  const file = args.swagger.params.upfile.value;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return res.status(413).json({ message: 'File too large. Maximum size is 50 MB.' });
  }

  const targetUrl = `${DOCLING_URL}/v1/convert/file`;
  defaultLog.info(`[demi] Forwarding file "${file.originalname}" (${file.size} bytes) to ${targetUrl}`);

  let response;
  try {
    const fd = new FormData();
    fd.append('files', new Blob([file.buffer], { type: file.mimetype }), file.originalname);

    const headers = {};
    if (DOCLING_API_KEY) {
      headers['X-Api-Key'] = DOCLING_API_KEY;
    }

    response = await fetch(targetUrl, {
      method: 'POST',
      body: fd,
      headers,
      signal: AbortSignal.timeout(300_000), // 5 min — large PDFs can take time
    });
  } catch (err) {
    defaultLog.error(`[demi] Failed to reach docling-serve: ${err.message}`);
    return res.status(502).json({ message: 'Could not connect to extraction service. Is eagle-demi running?' });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    defaultLog.error(`[demi] docling-serve returned ${response.status}: ${text}`);
    return res.status(502).json({ message: `Extraction service returned ${response.status}.` });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    defaultLog.error(`[demi] docling-serve response is not JSON: ${err.message}`);
    return res.status(502).json({ message: 'Unexpected response from extraction service.' });
  }

  const markdown = data?.document?.md_content || '';
  defaultLog.info(`[demi] Extraction complete for "${file.originalname}" — ${markdown.length} chars`);

  return res.status(200).json({ markdown });
};
