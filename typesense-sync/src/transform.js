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

/**
 * Extract allowed roles from a MongoDB document's read array.
 * Defaults to ['public'] when read is absent (legacy docs without explicit ACL).
 * Used to populate the allowed_roles field in Typesense so scoped search keys
 * can filter by role at query time.
 */
function extractRoles(doc) {
  if (Array.isArray(doc.read) && doc.read.length > 0) return doc.read;
  // Fail-closed: docs with no read array default to sysadmin-only.
  // Never default to 'public' — that would expose unpublished/legacy docs.
  return ['sysadmin'];
}

/**
 * Constrain a child document's roles to the intersection with its parent project's read array.
 * A child (activity, document) must never be more visible than its parent project.
 *
 * ONLY call this when projectId exists. Fail-closed:
 *  - projectMeta missing (deleted/unnamed project) → sysadmin-only
 *  - empty read array on project → sysadmin-only
 *  - empty intersection → sysadmin-only
 */
function constrainToProject(childRoles, projectMeta) {
  if (!projectMeta || !Array.isArray(projectMeta.read) || projectMeta.read.length === 0) {
    return ['sysadmin'];
  }
  const projectSet = new Set(projectMeta.read);
  const intersected = childRoles.filter(role => projectSet.has(role));
  return intersected.length > 0 ? intersected : ['sysadmin'];
}

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
  const projectMeta = (projectLookup && projectId && projectLookup.has(projectId))
    ? projectLookup.get(projectId)
    : undefined;
  const projectName = projectMeta?.name;

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
    isFeatured: doc.isFeatured === true,
    ...(str(doc.documentSource)    && { documentSource: str(doc.documentSource) }),
    allowed_roles: projectId ? constrainToProject(extractRoles(doc), projectMeta) : extractRoles(doc),
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
    ...(str(leg.location)         && { location:         str(leg.location) }),
    ...(str(leg.shortName)        && { displayName:      str(leg.shortName) }),
    ...(resolvePermissive(leg.proponent, listLookup)    && { proponent:        resolvePermissive(leg.proponent, listLookup) }),
    ...(toTimestamp(leg.dateUpdated)    !== undefined && { updatedDate:   toTimestamp(leg.dateUpdated) }),
    ...(toTimestamp(leg.decisionDate)  !== undefined && { decisionDate:  toTimestamp(leg.decisionDate) }),
    ...parseCentroid(leg.centroid),
    allowed_roles: extractRoles(doc),
  };
}

function transformRecentActivity(doc, listLookup, projectLookup, pcpLookup) {
  const projectId   = doc.project ? doc.project.toString() : undefined;
  const projectMeta = (projectLookup && projectId && projectLookup.has(projectId))
    ? projectLookup.get(projectId)
    : undefined;
  const projectName = projectMeta?.name;

  // Strip HTML tags so indexed text doesn't contain markup; preserve original for display.
  const contentHtml  = str(doc.content);
  const contentPlain = contentHtml
    ? contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined
    : undefined;

  // PCP (Comment Period) — stored as an ObjectId ref on the RecentActivity doc.
  // Look up isMet and metURL so the frontend can route "View Engagement" correctly.
  const pcpId  = doc.pcp ? doc.pcp.toString() : undefined;
  const pcpMeta = (pcpLookup && pcpId && pcpLookup.has(pcpId)) ? pcpLookup.get(pcpId) : null;

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
    // PCP routing fields
    ...(pcpId                          && { pcpId }),
    ...(pcpMeta?.isMet === true        && { pcpIsMet: true }),
    ...(pcpMeta?.metURL                && { pcpMetURL: str(pcpMeta.metURL) }),
    // ProjectNotification ref — lets the frontend fetch inline documents on the Updates tab
    ...(doc.projectNotification        && { projectNotificationId: doc.projectNotification.toString() }),
    allowed_roles: projectId ? constrainToProject(extractRoles(doc), projectMeta) : extractRoles(doc),
  };
}

function transformProjectNotification(doc, listLookup) {
  const descriptionHtml  = str(doc.description);
  const description      = descriptionHtml
    ? descriptionHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined
    : undefined;

  // pcp is stored as a plain string: 'none' | 'pending' | 'open' | 'closed'
  const pcp = str(doc.pcp) && doc.pcp !== 'none' ? str(doc.pcp) : undefined;

  return {
    id: doc._id.toString(),
    ...(str(doc.name)                    && { name:                    str(doc.name) }),
    ...(description                      && { description }),
    ...(descriptionHtml                  && { descriptionHtml }),
    ...(str(doc.proponent)               && { proponent:               str(doc.proponent) }),
    ...(str(doc.location)                && { location:                str(doc.location) }),
    ...(resolvePermissive(doc.type, listLookup)   && { type:   resolvePermissive(doc.type, listLookup) }),
    ...(str(doc.subType)                 && { subType:               str(doc.subType) }),
    ...(str(doc.trigger)                 && { trigger:               str(doc.trigger) }),
    ...(resolvePermissive(doc.region, listLookup) && { region: resolvePermissive(doc.region, listLookup) }),
    ...(str(doc.decision)                && { decision:                str(doc.decision) }),
    ...(pcp                              && { pcp }),
    ...(toTimestamp(doc.notificationReceivedDate) !== undefined && { notificationReceivedDate: toTimestamp(doc.notificationReceivedDate) }),
    ...(toTimestamp(doc.decisionDate)    !== undefined && { decisionDate: toTimestamp(doc.decisionDate) }),
    ...(doc.associatedProjectId          && { associatedProjectId:     doc.associatedProjectId.toString() }),
    ...(str(doc.associatedProjectName)   && { associatedProjectName:   str(doc.associatedProjectName) }),
    ...parseCentroid(doc.centroid),
    allowed_roles: extractRoles(doc),
  };
}

function transformDocumentChunk(doc, listLookup, projectLookup) {
  const documentId = doc.documentId ? doc.documentId.toString() : undefined;
  const projectId  = doc.projectId  ? doc.projectId.toString()  : undefined;

  if (!documentId || !str(doc.content)) return null;

  const projectMeta = (projectLookup && projectId) ? projectLookup.get(projectId) : undefined;
  const projectName = str(doc.projectName) || projectMeta?.name;

  return {
    id: `${documentId}_chunk_${doc.chunkIndex ?? 0}_p${doc.pageNumber ?? 0}`,
    content:      str(doc.content),
    documentId,
    ...(projectId                                              && { projectId }),
    pageNumber:   typeof doc.pageNumber  === 'number' ? doc.pageNumber  : 0,
    ...(typeof doc.chunkIndex === 'number' && { chunkIndex: doc.chunkIndex }),
    ...(resolveStrict(doc.documentType, listLookup)           && { documentType: resolveStrict(doc.documentType, listLookup) }),
    ...(resolveStrict(doc.milestone, listLookup)              && { milestone:    resolveStrict(doc.milestone, listLookup) }),
    ...(toTimestamp(doc.datePosted) !== undefined && { datePosted: toTimestamp(doc.datePosted) }),
    ...(str(doc.documentName)        && { documentName:  str(doc.documentName) }),
    ...(projectName                  && { projectName }),
    // Chunks inherit roles from parent document (doc.read stored by content-extract.js)
    allowed_roles: extractRoles(doc),
  };
}

const TRANSFORMS = {
  Document:            transformDocument,
  Project:             transformProject,
  RecentActivity:      transformRecentActivity,
  ProjectNotification: transformProjectNotification,
  DocumentChunk:       transformDocumentChunk,
};

/**
 * Build a Map<projectIdString, { name, read }> for all Project documents.
 * Project names are nested under legislation sub-objects (e.g. legislation_2018.name).
 * The read array is included so child documents (activities, documents) can inherit
 * the parent project's visibility — a child must never be more permissive than its project.
 */
async function buildProjectLookup(db) {
  const docs = await db.collection('epic')
    .find({ _schemaName: 'Project' })
    .project({ _id: 1, read: 1, name: 1, displayName: 1, legislation_2018: 1, legislation_2002: 1, legislation_1996: 1, currentLegislationYear: 1 })
    .toArray();
  const map = new Map();
  for (const item of docs) {
    const leg = getLegislationBlock(item);
    const name = leg.name || leg.shortName || item.name || item.displayName;
    if (name) map.set(item._id.toString(), { name, read: item.read || [] });
  }
  return map;
}

/**
 * Build a Map<idString, { isMet, metURL }> for all public CommentPeriod documents.
 * Used to populate pcpId/pcpIsMet/pcpMetURL on RecentActivity records at sync time.
 */
async function buildPcpLookup(db) {
  const docs = await db.collection('epic')
    .find({ _schemaName: 'CommentPeriod', read: { $in: ['public'] } })
    .project({ _id: 1, isMet: 1, metURL: 1 })
    .toArray();
  const map = new Map();
  for (const item of docs) {
    map.set(item._id.toString(), {
      isMet:  item.isMet  === true,
      metURL: item.metURL || null,
    });
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
 * @param {Map} [pcpLookup]     - Optional id→{ isMet, metURL } map built with buildPcpLookup()
 */
function transformDoc(schemaName, doc, listLookup, projectLookup, pcpLookup) {
  const fn = TRANSFORMS[schemaName];
  if (!fn) return null;
  try {
    return fn(doc, listLookup, projectLookup, pcpLookup);
  } catch (err) {
    console.warn(`Transform failed for ${schemaName} ${doc._id}:`, err.message);
    return null;
  }
}

module.exports = { transformDoc, buildListLookup, buildProjectLookup, buildPcpLookup };
