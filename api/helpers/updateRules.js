/**
 * Rules for an Update (`RecentActivity`): field checks on write, the `status` -> `active`/`read[]`
 * mapping older readers still rely on, and the public visibility test.
 */

'use strict';

const mongoose = require('mongoose');
const constants = require('./constants');

const STATUSES = ['draft', 'published', 'archived'];
const SHORT_HEADLINE_MAX = 70;
const SUMMARY_MAX = 280;
const IMAGES_MAX = 5;
const IMAGE_CAPTION_MAX = 300;
const IMAGE_CREDIT_MAX = 150;
const CORPORATE = 'Corporate';
const PN_PCP_TYPE = 'Project Notification Public Comment Period';

exports.STATUSES = STATUSES;
exports.SHORT_HEADLINE_MAX = SHORT_HEADLINE_MAX;
exports.SUMMARY_MAX = SUMMARY_MAX;
exports.PN_PCP_TYPE = PN_PCP_TYPE;

const isBlank = value => value === undefined || value === null || String(value).trim() === '';
const hasTag = value => /<[a-z!/][^>]*>/i.test(String(value));

// Staff bookkeeping a public reader has no use for.
const HIDDEN_FROM_PUBLIC = ['notifiedAt', '_addedBy', '_updatedBy'];

const isHttpUrl = value => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch (err) {
    return false;
  }
};

const captionCreditErrors = ({ caption, credit }, label) => {
  const errors = [];
  if (!isBlank(caption) && String(caption).length > IMAGE_CAPTION_MAX) {
    errors.push(`${label}.caption must be ${IMAGE_CAPTION_MAX} characters or fewer`);
  }
  if (!isBlank(credit) && String(credit).length > IMAGE_CREDIT_MAX) {
    errors.push(`${label}.credit must be ${IMAGE_CREDIT_MAX} characters or fewer`);
  }
  return errors;
};

const imageErrors = (images) => {
  if (images === undefined || images === null) {
    return [];
  }
  if (!Array.isArray(images)) {
    return ['images must be a list'];
  }
  const errors = images.length > IMAGES_MAX ? [`images must hold ${IMAGES_MAX} or fewer`] : [];
  images.forEach((image, i) => {
    const { document, alt } = image || {};
    if (isBlank(document)) {
      errors.push(`images[${i}].document is required`);
    }
    if (isBlank(alt)) {
      errors.push(`images[${i}].alt is required`);
    }
    errors.push(...captionCreditErrors(image || {}, `images[${i}]`));
  });
  return errors;
};

/**
 * Checks an Update as it will be stored (for a PUT: the stored row with the body laid over it).
 * Returns a list of messages, empty when the Update is valid.
 */
exports.validate = (update) => {
  const errors = [];

  if (!isBlank(update.status) && !STATUSES.includes(update.status)) {
    errors.push(`status must be one of ${STATUSES.join(', ')}`);
  }
  if (!isBlank(update.shortHeadline) && String(update.shortHeadline).length > SHORT_HEADLINE_MAX) {
    errors.push(`shortHeadline must be ${SHORT_HEADLINE_MAX} characters or fewer`);
  }
  if (!isBlank(update.summary) && String(update.summary).length > SUMMARY_MAX) {
    errors.push(`summary must be ${SUMMARY_MAX} characters or fewer`);
  }
  ['shortHeadline', 'summary'].forEach(field => {
    if (!isBlank(update[field]) && hasTag(update[field])) {
      errors.push(`${field} must be plain text, no HTML tags`);
    }
  });
  if (update.featuredImage && !isBlank(update.featuredImage.document) && isBlank(update.featuredImage.alt)) {
    errors.push('featuredImage.alt is required when featuredImage.document is set');
  }
  if (update.featuredImage) {
    errors.push(...captionCreditErrors(update.featuredImage, 'featuredImage'));
  }
  errors.push(...imageErrors(update.images));
  if (!isBlank(update.engagementUrl) && !isHttpUrl(update.engagementUrl)) {
    errors.push('engagementUrl must be an http or https URL');
  }
  // Rows written before categories existed carry none, and those keep saving as they did. Comment
  // period Updates hang off a pcp or a project notification, and the admin sends no project for them.
  if (!isBlank(update.category)) {
    if (update.category === CORPORATE && isBlank(update.subject)) {
      errors.push('subject is required for a Corporate update');
    } else if (update.category !== CORPORATE && isBlank(update.project) && isBlank(update.pcp) && update.type !== PN_PCP_TYPE) {
      errors.push('project is required unless the category is Corporate');
    }
  }

  return errors;
};

/**
 * Writes `status`, `publishDate`, `active` and `read[]` onto `target` (the request body) so they
 * agree. `update` is the row as it will be stored. A client that still sends only `active` gets a
 * status derived from it.
 */
exports.applyStatus = (target, update, { now = new Date(), wasLive = false } = {}) => {
  const status = isBlank(update.status) ? (update.active === true ? 'published' : 'draft') : update.status;
  const published = status === 'published';
  const baseRead = Array.isArray(update.read) && update.read.length ? update.read : constants.SECURE_ROLES;

  target.status = status;
  target.active = published;
  target.read = baseRead.filter(role => role !== 'public').concat(published ? ['public'] : []);
  // Going live with no date in the request means now; a row already live keeps the date it went live.
  if (published && (isBlank(update.publishDate) || (isBlank(target.publishDate) && !wasLive))) {
    target.publishDate = now;
  }

  return target;
};

/**
 * Field checks plus, for an Update that will be published, the public check on the documents it
 * shows. `update` is the row as it will be stored, status already applied.
 */
exports.check = async (update) => {
  const errors = exports.validate(update);
  if (!errors.length && update.status === 'published') {
    const hidden = await exports.nonPublicDocumentIds(update);
    if (hidden.length) {
      errors.push(`featuredImage, images and attachments must be public documents; not public: ${hidden.join(', ')}`);
    }
  }
  return errors;
};

exports.isLive = (row, now = new Date()) => {
  const published = row.status === 'published' || (isBlank(row.status) && row.active === true);
  return published && (isBlank(row.publishDate) || new Date(row.publishDate) <= now);
};

// documentSource of images uploaded from the Update form; they publish and unpublish with the Update.
exports.IMAGE_SOURCE = 'UPDATE';

const idList = values => [...new Set(values.filter(id => !isBlank(id)).map(String))];

/**
 * Ids of the documents an Update shows as images: the featured image and the gallery.
 */
exports.imageDocumentIds = (update) => idList([
  update && update.featuredImage && update.featuredImage.document,
  ...(update && Array.isArray(update.images) ? update.images.map(image => image && image.document) : [])
]);

/**
 * Ids of the featured image, images and attachments that the public cannot read (or that do not
 * exist). An image uploaded from the Update form of the same project passes: publishing the Update
 * publishes it.
 */
exports.nonPublicDocumentIds = async (update) => {
  const imageIds = exports.imageDocumentIds(update);
  const ids = idList([...imageIds, ...(Array.isArray(update.attachments) ? update.attachments : [])]);
  if (!ids.length) {
    return [];
  }
  const docs = await mongoose.model('Document').find({ _id: { $in: ids } }, { read: 1, documentSource: 1, project: 1 }).lean();
  const passes = new Set(docs
    .filter(doc => (doc.read || []).includes('public') ||
      (doc.documentSource === exports.IMAGE_SOURCE && imageIds.includes(String(doc._id)) &&
        String(doc.project || null) === String(update.project || null)))
    .map(doc => String(doc._id)));
  return ids.filter(id => !passes.has(id));
};

/**
 * Mongo match for Updates the public may see now. Rows the backfill has not reached yet carry no
 * status and fall back to `active`; the caller's `read[]` check still applies to both.
 */
exports.publicVisibleMatch = (now = new Date()) => ({
  $or: [
    { status: 'published', publishDate: { $lte: now } },
    { status: null, active: true }
  ]
});

exports.isPublicCaller = (roles) => !(Array.isArray(roles) ? roles : []).some(role => constants.SECURE_ROLES.includes(role));

/**
 * Stages gating Updates by caller: public callers see only live Updates without staff fields;
 * staff lose archived Updates unless they filtered on status themselves.
 */
exports.visibilityAggr = (roles, { includeArchived = false, now = new Date() } = {}) => {
  if (exports.isPublicCaller(roles)) {
    return [
      { $match: exports.publicVisibleMatch(now) },
      { $project: Object.fromEntries(HIDDEN_FROM_PUBLIC.map(field => [field, 0])) }
    ];
  }
  return includeArchived ? [] : [{ $match: { status: { $ne: 'archived' } } }];
};
