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

function transformProject(doc, listLookup) {
  // Project data is nested under the current legislation year key
  // (e.g., doc.legislation_2018 or doc.legislation_2002).
  // currentLegislationYear holds the key; fall back to checking all three.
  const legKey = doc.currentLegislationYear || 'legislation_2018';
  const leg = doc[legKey] || doc.legislation_2018 || doc.legislation_2002 || doc.legislation_1996 || {};

  // Resolve an ObjectId reference to its display name via the List lookup.
  // Falls back to the raw string if the ID is not found (e.g. lookup not available).
  function resolve(val) {
    if (val == null || val === '') return undefined;
    const s = val.toString();
    return (listLookup && listLookup.has(s)) ? listLookup.get(s) : s;
  }

  return {
    id:               doc._id.toString(),
    ...(str(leg.name)             && { name:             str(leg.name) }),
    ...(str(leg.description)      && { description:      str(leg.description) }),
    ...(str(leg.region)           && { region:           str(leg.region) }),
    ...(str(leg.status)           && { status:           str(leg.status) }),
    ...(resolve(leg.currentPhaseName) && { currentPhaseName: resolve(leg.currentPhaseName) }),
    ...(resolve(leg.eacDecision)      && { eacDecision:      resolve(leg.eacDecision) }),
    ...(str(leg.type)             && { type:             str(leg.type) }),
    ...(str(leg.sector)           && { sector:           str(leg.sector) }),
    ...(str(leg.shortName)        && { displayName:      str(leg.shortName) }),
    ...(resolve(leg.proponent)    && { proponent:        resolve(leg.proponent) }),
    ...(toTimestamp(leg.dateUpdated)    !== undefined && { updatedDate:   toTimestamp(leg.dateUpdated) }),
    ...(toTimestamp(leg.decisionDate)  !== undefined && { decisionDate:  toTimestamp(leg.decisionDate) }),
    ...parseCentroid(leg.centroid),
  };
}

const TRANSFORMS = {
  Project: transformProject,
};

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
 * @param {Map} [listLookup] - Optional id→name map built with buildListLookup()
 */
function transformDoc(schemaName, doc, listLookup) {
  const fn = TRANSFORMS[schemaName];
  if (!fn) return null;
  try {
    return fn(doc, listLookup);
  } catch (err) {
    console.warn(`Transform failed for ${schemaName} ${doc._id}:`, err.message);
    return null;
  }
}

module.exports = { transformDoc, buildListLookup };
