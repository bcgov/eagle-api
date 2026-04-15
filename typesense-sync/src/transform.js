'use strict';

/**
 * Transform MongoDB documents into Typesense-compatible flat objects.
 *
 * Rules:
 *  - id = MongoDB _id as string (Typesense requires "id" field)
 *  - Dates → Unix timestamp in seconds (int64)
 *  - ObjectId references → string
 *  - Omit null/undefined/empty values — Typesense optional fields handle absence
 */

function toTimestamp(value) {
  if (!value) return undefined;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

function str(value) {
  if (value == null || value === '') return undefined;
  return String(value);
}

/**
 * Parse a [lng, lat] centroid pair from a legislation sub-object.
 * Validates that coordinates are within BC bounds before accepting.
 * Returns { centroid: [lng, lat] } or {} if invalid.
 */
function parseCentroid(c) {
  if (!Array.isArray(c) || c.length < 2) return {};
  const lng = parseFloat(c[0]);
  const lat = parseFloat(c[1]);
  if (isNaN(lng) || isNaN(lat) || lat < 48 || lat > 60 || lng < -139 || lng > -114) return {};
  return { centroid: [lng, lat] };
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function resolveStrict(val, listLookup) {
  if (val == null || val === '') return undefined;
  const s = val.toString();
  if (listLookup && listLookup.has(s)) return listLookup.get(s);
  if (OBJECT_ID_RE.test(s)) return undefined;
  return s;
}

function resolvePermissive(val, listLookup) {
  if (val == null || val === '') return undefined;
  const s = val.toString();
  return (listLookup && listLookup.has(s)) ? listLookup.get(s) : s;
}

function getLegislationBlock(doc) {
  const legKey = doc.currentLegislationYear || 'legislation_2018';
  return doc[legKey] || doc.legislation_2018 || doc.legislation_2002 || doc.legislation_1996 || {};
}

function transformDocument(doc, listLookup, projectLookup) {
  const projectId  = doc.project ? doc.project.toString() : undefined;
  const projectName = (projectLookup && projectId && projectLookup.has(projectId))
    ? projectLookup.get(projectId)
    : undefined;

  const leg = typeof doc.legislation === 'number' && doc.legislation > 0
    ? doc.legislation
    : undefined;

  return {
    id: doc._id.toString(),
    ...(str(doc.displayName)       && { displayName:        str(doc.displayName) }),
    ...(str(doc.documentFileName)  && { documentFileName:   str(doc.documentFileName) }),
    ...(str(doc.description)       && { description:        str(doc.description) }),
    ...(projectName                && { projectName }),
    ...(projectId                  && { projectId }),
    ...(resolveStrict(doc.type, listLookup)               && { type:               resolveStrict(doc.type, listLookup) }),
    ...(resolveStrict(doc.milestone, listLookup)           && { milestone:          resolveStrict(doc.milestone, listLookup) }),
    ...(resolveStrict(doc.documentAuthorType, listLookup)  && { documentAuthorType: resolveStrict(doc.documentAuthorType, listLookup) }),
    ...(resolveStrict(doc.projectPhase, listLookup)        && { projectPhase:       resolveStrict(doc.projectPhase, listLookup) }),
    ...(leg !== undefined          && { legislation: leg }),
    ...(str(doc.internalExt)       && { internalExt:        str(doc.internalExt) }),
    ...(toTimestamp(doc.datePosted)    !== undefined && { datePosted:    toTimestamp(doc.datePosted) }),
    ...(toTimestamp(doc.dateUploaded)  !== undefined && { dateUploaded:  toTimestamp(doc.dateUploaded) }),
  };
}

function transformProject(doc, listLookup) {
  const leg = getLegislationBlock(doc);

  return {
    id:               doc._id.toString(),
    ...(str(leg.name)             && { name:             str(leg.name) }),
    ...(str(leg.description)      && { description:      str(leg.description) }),
    ...(str(leg.region)           && { region:           str(leg.region) }),
    ...(str(leg.status)           && { status:           str(leg.status) }),
    ...(resolvePermissive(leg.currentPhaseName, listLookup) && { currentPhaseName: resolvePermissive(leg.currentPhaseName, listLookup) }),
    ...(resolvePermissive(leg.eacDecision, listLookup)      && { eacDecision:      resolvePermissive(leg.eacDecision, listLookup) }),
    ...(str(leg.type)             && { type:             str(leg.type) }),
    ...(str(leg.sector)           && { sector:           str(leg.sector) }),
    ...(str(leg.shortName)        && { displayName:      str(leg.shortName) }),
    ...(resolvePermissive(leg.proponent, listLookup)    && { proponent:        resolvePermissive(leg.proponent, listLookup) }),
    ...(toTimestamp(leg.dateUpdated)    !== undefined && { updatedDate:   toTimestamp(leg.dateUpdated) }),
    ...(toTimestamp(leg.decisionDate)  !== undefined && { decisionDate:  toTimestamp(leg.decisionDate) }),
    ...parseCentroid(leg.centroid),
  };
}

function transformRecentActivity(doc, listLookup, projectLookup) {
  const projectId   = doc.project ? doc.project.toString() : undefined;
  const projectName = (projectLookup && projectId && projectLookup.has(projectId))
    ? projectLookup.get(projectId)
    : undefined;

  // Strip HTML tags so indexed text doesn't contain markup; preserve original for display.
  const contentHtml  = str(doc.content);
  const contentPlain = contentHtml
    ? contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined
    : undefined;

  return {
    id: doc._id.toString(),
    ...(str(doc.headline)              && { headline:                 str(doc.headline) }),
    ...(contentPlain                   && { content:                  contentPlain }),
    ...(contentHtml                    && { contentHtml }),
    ...(str(doc.notificationName)      && { notificationName:         str(doc.notificationName) }),
    ...(str(doc.type)                  && { type:                     str(doc.type) }),
    ...(projectId                      && { projectId }),
    ...(projectName                    && { projectName }),
    active:                   doc.active  === true,
    pinned:                   doc.pinned  === true,
    complianceAndEnforcement: doc.complianceAndEnforcement === true,
    ...(str(doc.documentUrl)           && { documentUrl:              str(doc.documentUrl) }),
    ...(str(doc.contentUrl)            && { contentUrl:               str(doc.contentUrl) }),
    ...(toTimestamp(doc.dateAdded) !== undefined && { dateAdded: toTimestamp(doc.dateAdded) }),
  };
}

const TRANSFORMS = {
  Document:       transformDocument,
  Project:        transformProject,
  RecentActivity: transformRecentActivity,
};

/**
 * Build a Map<projectIdString, projectName> for all public Project documents.
 * Project names are nested under legislation sub-objects (e.g. legislation_2018.name).
 */
async function buildProjectLookup(db) {
  const docs = await db.collection('epic')
    .find({ _schemaName: 'Project' })
    .project({ _id: 1, legislation_2018: 1, legislation_2002: 1, legislation_1996: 1, currentLegislationYear: 1 })
    .toArray();
  const map = new Map();
  for (const item of docs) {
    const leg = getLegislationBlock(item);
    const name = leg.name || leg.shortName;
    if (name) map.set(item._id.toString(), name);
  }
  return map;
}

/**
 * Build a Map<idString, name> for all List and Organization documents.
 * Pass the result into transformDoc so ObjectId references are resolved to labels.
 */
async function buildListLookup(db) {
  const docs = await db.collection('epic')
    .find({ _schemaName: { $in: ['List', 'Organization'] } })
    .project({ _id: 1, name: 1 })
    .toArray();
  const map = new Map();
  for (const item of docs) {
    if (item.name) map.set(item._id.toString(), item.name);
  }
  return map;
}

/**
 * Transform a MongoDB document into a Typesense document.
 * Returns null if the schemaName is not indexed.
 * @param {Map} [listLookup]    - Optional id→name map built with buildListLookup()
 * @param {Map} [projectLookup] - Optional id→name map built with buildProjectLookup()
 */
function transformDoc(schemaName, doc, listLookup, projectLookup) {
  const fn = TRANSFORMS[schemaName];
  if (!fn) return null;
  try {
    return fn(doc, listLookup, projectLookup);
  } catch (err) {
    console.warn(`Transform failed for ${schemaName} ${doc._id}:`, err.message);
    return null;
  }
}

module.exports = { transformDoc, buildListLookup, buildProjectLookup };
