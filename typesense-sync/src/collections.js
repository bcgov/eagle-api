'use strict';

/**
 * Typesense collection schemas for eagle-api search data.
 *
 * - Field weights mirror the MongoDB searchIndex_1 text index weights.
 * - Facet fields match the filter lists used by eagle-public's search UI.
 * - All non-id fields are optional so partial documents don't fail import.
 * - Dates are stored as int64 Unix timestamps (seconds) for range filtering.
 *
 * Schema names are used as both the Typesense collection name and the alias.
 * The alias is what the search controller queries — the nightly re-index
 * creates a new collection with a timestamp suffix and swaps the alias.
 */

const DOCUMENT_SCHEMA = {
  name: 'documents',
  fields: [
    { name: 'id',                 type: 'string' },
    // Search fields
    { name: 'displayName',        type: 'string',  index: true,  optional: true },
    { name: 'documentFileName',   type: 'string',  index: true,  optional: true },
    { name: 'description',        type: 'string',  index: true,  optional: true },
    { name: 'projectName',        type: 'string',  index: true,  optional: true },
    // Facet / filter fields
    { name: 'type',               type: 'string',  facet: true,  optional: true },
    { name: 'milestone',          type: 'string',  facet: true,  optional: true },
    { name: 'documentAuthorType', type: 'string',  facet: true,  optional: true },
    { name: 'projectPhase',       type: 'string',  facet: true,  optional: true },
    { name: 'legislation',        type: 'int32',   facet: true,  optional: true },
    // Metadata
    { name: 'projectId',          type: 'string',               optional: true },
    { name: 'internalExt',        type: 'string',               optional: true },
    { name: 'datePosted',         type: 'int64',   sort: true,   optional: true },
    { name: 'dateUploaded',       type: 'int64',   sort: true,   optional: true },
  ],
};

const PROJECT_SCHEMA = {
  name: 'projects',
  fields: [
    { name: 'id',               type: 'string' },
    { name: 'name',             type: 'string',  index: true,  optional: true },
    { name: 'displayName',      type: 'string',  index: true,  optional: true },
    { name: 'description',      type: 'string',  index: true,  optional: true },
    { name: 'epicProjectId',    type: 'string',  index: true,  optional: true },
    // Filter + facet fields
    { name: 'region',           type: 'string',  facet: true,  optional: true },
    { name: 'status',           type: 'string',  facet: true,  optional: true },
    { name: 'currentPhaseName', type: 'string',  facet: true,  optional: true },
    { name: 'eacDecision',      type: 'string',  facet: true,  optional: true },
    { name: 'type',             type: 'string',  facet: true,  optional: true },
    { name: 'sector',           type: 'string',  facet: true,  optional: true },
    // Proponent name stored for display / search
    { name: 'proponent',        type: 'string',  index: true,  optional: true },
    { name: 'updatedDate',      type: 'int64',   sort: true,   optional: true },
    { name: 'decisionDate',     type: 'int64',   sort: true,   optional: true },
    // [lng, lat] centroid for map thumbnail in search results
    { name: 'centroid',         type: 'float[]',               optional: true },
  ],
};

/** Map _schemaName → Typesense schema */
const SCHEMAS = {
  Document: DOCUMENT_SCHEMA,
  Project:  PROJECT_SCHEMA,
};

/**
 * Query_by fields and their weights for each schema, used in search requests.
 * Weights mirror the MongoDB searchIndex_1 weights.
 */
const QUERY_BY = {
  Document: {
    fields:  'displayName,documentFileName,description,projectName',
    weights: '8500,5000,8000,3000',
  },
  Project: {
    fields:  'name,displayName,description,epicProjectId,proponent',
    weights: '9000,8500,8000,3000,1000',
  },
};

/**
 * Facet fields to include in every search response, keyed by schemaName.
 */
const FACET_BY = {
  Document: 'type,milestone,documentAuthorType,projectPhase,legislation',
  Project:  'region,status,currentPhaseName,eacDecision,type,sector',
};

module.exports = { SCHEMAS, QUERY_BY, FACET_BY };
