'use strict';

/**
 * DEMI Document Intake Webhook / Cache Sync
 *
 * Receives synced Document metadata from eagle-demi (demi-api) and caches it
 * in eagle-api's local MongoDB read-only cache.
 */

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

/**
 * POST /api/document/sync
 *
 * Accepts a Document JSON payload from eagle-demi and caches it locally.
 * Returns 200 on success.
 */
exports.syncDocumentFromDemi = async function (args, res) {
  // 1. Verify API Key
  const apiKey = args.headers['x-api-key'] || args.headers['X-Api-Key'] || args.headers['api-key'];
  const expectedKey = process.env.DOCLING_API_KEY || 'eagle-demi-api-key';
  if (!apiKey || apiKey !== expectedKey) {
    defaultLog.warn('[demi-sync] Unauthorized sync attempt');
    return res.status(403).json({ message: 'Unauthorized.' });
  }

  // 2. Get document body
  const docData = args.swagger.params.body && args.swagger.params.body.value;
  if (!docData || !docData._id) {
    return res.status(400).json({ message: 'Missing document data or _id.' });
  }

  const Document = mongoose.model('Document');

  // Map permissions: if published, add public to read array
  const readPerms = ['sysadmin', 'staff'];
  if (docData.isPublished) {
    readPerms.push('public');
  }

  // Derive file extension
  let extension = '';
  if (docData.s3Key) {
    const extMatch = docData.s3Key.match(/\.([0-9a-z]+$)/i);
    if (extMatch) {
      extension = extMatch[1];
    }
  }

  const syncData = {
    _schemaName: 'Document',
    project: new mongoose.Types.ObjectId(docData.project),
    region: docData.region || '',
    edrmsRecordNumber: docData.edrmsRecordNumber,
    orcsClassification: docData.orcsClassification || '',
    displayName: docData.displayName || '',
    documentFileName: docData.displayName || '',
    internalOriginalName: docData.displayName || '',
    internalURL: docData.s3Key || '',
    internalExt: extension,
    passedAVCheck: true,
    documentSource: 'DEMI',
    demiReviewStatus: docData.isPublished ? 'approved' : 'unreviewed',
    contentExtracted: !!docData.contentExtracted,
    contentExtractedAt: docData.contentExtractedAt ? new Date(docData.contentExtractedAt) : null,
    contentPageCount: docData.contentPageCount || 0,
    contentExtractionError: docData.contentExtractionError || null,
    extractionMethod: docData.extractionMethod || '',
    read: readPerms,
    write: ['sysadmin', 'staff'],
    delete: ['sysadmin', 'staff'],
    _updatedDate: new Date(),
    _updatedBy: 'system-demi'
  };

  try {
    const query = { _id: new mongoose.Types.ObjectId(docData._id) };
    const update = {
      $set: syncData,
      $setOnInsert: {
        _createdDate: docData.createdAt ? new Date(docData.createdAt) : new Date(),
        _addedBy: 'system-demi'
      }
    };

    const updatedDoc = await Document.findOneAndUpdate(query, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });

    defaultLog.info(`[demi-sync] Cached document ${updatedDoc._id} successfully.`);
    return res.status(200).json({ message: 'Cached successfully', docId: String(updatedDoc._id) });
  } catch (err) {
    defaultLog.error(`[demi-sync] Error caching document: ${err.message}`);
    return res.status(500).json({ message: 'Failed to sync document to cache.' });
  }
};

