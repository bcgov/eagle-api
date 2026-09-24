/**
 * Images uploaded from the Update form (documentSource 'UPDATE'): upload limits, and keeping their
 * public state in step with the Updates that show them.
 */

'use strict';

const mongoose = require('mongoose');
const mime = require('mime-types');
const defaultLog = require('winston').loggers.get('default');
const updateRules = require('./updateRules');
const documentPublish = require('./documentPublish');

// The file's own bytes must match its declared type; the client's MIME and name alone prove nothing.
const SIGNATURES = {
  'image/jpeg': buf => buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/png': buf => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buf => buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP',
  'image/gif': buf => ['GIF87a', 'GIF89a'].includes(buf.toString('latin1', 0, 6))
};
const MAX_BYTES = 10 * 1024 * 1024;

exports.TYPE_ERROR = 'Update images must be JPEG, PNG, WebP or GIF files.';
exports.SIZE_ERROR = 'Update images must be 10MB or smaller.';
exports.PROJECT_ERROR = 'Update images must be uploaded to a project.';

/**
 * Message for an upload that may not become an Update image, else null. The file's bytes, the
 * declared type and every file name sent must agree on one of the allowed image types.
 */
exports.uploadError = (upfile, documentFileName) => {
  const names = [documentFileName, upfile.originalname].filter(Boolean);
  const signature = SIGNATURES[upfile.mimetype];
  const typeOk = Boolean(signature) && Buffer.isBuffer(upfile.buffer) && signature(upfile.buffer) &&
    names.length > 0 && names.every(name => mime.lookup(name) === upfile.mimetype);
  if (!typeOk) {
    return exports.TYPE_ERROR;
  }
  return upfile.size > MAX_BYTES ? exports.SIZE_ERROR : null;
};

const updateImageDocs = (ids, filter) => mongoose.model('Document').find({
  _id: { $in: ids }, _schemaName: 'Document', documentSource: updateRules.IMAGE_SOURCE, ...filter
});

// Private again means back to the state it was uploaded in, not Rejected.
const unPublish = (doc, username) => documentPublish.unPublish(doc, username, null, null);

/**
 * Makes documents this request published private again after a failed Update save, unless another
 * published Update shows them (it may have saved in between). Never throws.
 */
exports.revert = (docs, username) => exports.release(docs.map(doc => doc._id), '(not saved)', username);

/**
 * Publishes the Update's own uploaded images (same project) that are still private. Call before
 * saving the Update, so it is never live with a private image. On failure, reverts what it
 * published and throws.
 */
exports.publishFor = async (update, username) => {
  const ids = updateRules.imageDocumentIds(update);
  if (!ids.length) {
    return [];
  }
  const docs = await updateImageDocs(ids, { read: { $ne: 'public' }, project: update.project || null });
  const published = [];
  try {
    for (const doc of docs) {
      published.push(await documentPublish.publish(doc, username));
      defaultLog.info(`Published Update image ${doc._id} for Update ${update._id || '(new)'}`);
    }
  } catch (e) {
    defaultLog.error(`Publishing images for Update ${update._id || '(new)'} failed: ${e.message}`);
    await exports.revert(published, username);
    throw e;
  }
  return published;
};

/**
 * publishFor again once a published Update is saved: a concurrent release may have unpublished a
 * shared image between publishFor and the save. Never throws: the Update change already stands.
 */
exports.republish = async (update, username) => {
  try {
    await exports.publishFor(update, username);
  } catch (e) {
    defaultLog.error(`Update ${update._id} is saved published but its images could not be republished: ${e.message}`);
  }
};

// Ids among docIds that a published Update shows as an image or attachment.
const shownIds = async (docIds) => {
  const others = await mongoose.model('RecentActivity').find({
    _schemaName: 'RecentActivity',
    $and: [
      // Rows the status backfill has not reached go by active.
      { $or: [{ status: 'published' }, { status: null, active: true }] },
      { $or: [
        { 'featuredImage.document': { $in: docIds } },
        { 'images.document': { $in: docIds } },
        { attachments: { $in: docIds } }
      ] }
    ]
  }, { featuredImage: 1, images: 1, attachments: 1 }).lean();
  return new Set(others.flatMap(other => [
    ...updateRules.imageDocumentIds(other),
    ...(other.attachments || []).map(String)
  ]));
};

/**
 * Unpublishes uploaded images among `ids` that no published Update shows. Call after the Update is
 * saved, so its own new state counts. Never throws: the Update change already stands.
 */
exports.release = async (ids, updateId, username) => {
  if (!ids.length) {
    return;
  }
  try {
    const docs = await updateImageDocs(ids, { read: 'public' });
    if (!docs.length) {
      return;
    }
    const shown = await shownIds(docs.map(doc => doc._id));
    const unpublished = [];
    for (const doc of docs.filter(doc => !shown.has(String(doc._id)))) {
      try {
        await unPublish(doc, username);
        unpublished.push(doc);
        defaultLog.info(`Unpublished Update image ${doc._id}; Update ${updateId} no longer shows it published`);
      } catch (e) {
        defaultLog.error(`Could not unpublish Update image ${doc._id} for Update ${updateId}: ${e.message}`);
      }
    }
    if (!unpublished.length) {
      return;
    }
    // An Update that saved published after the query above skipped these as public; publish them back.
    const nowShown = await shownIds(unpublished.map(doc => doc._id));
    for (const doc of unpublished.filter(doc => nowShown.has(String(doc._id)))) {
      await documentPublish.publish(doc, username);
      defaultLog.warn(`Republished Update image ${doc._id}: a published Update started showing it while Update ${updateId} released it`);
    }
  } catch (e) {
    defaultLog.error(`Could not release images of Update ${updateId}: ${e.message}`);
  }
};
