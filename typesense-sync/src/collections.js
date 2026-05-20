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
    { name: 'displayName',        type: 'string',  index: true,  sort: true,  optional: true },
    { name: 'documentFileName',   type: 'string',  index: true,  optional: true },
    { name: 'description',        type: 'string',  index: true,  optional: true },
    { name: 'projectName',        type: 'string',  index: true,  sort: true,  optional: true },
    // Facet / filter fields
    { name: 'type',               type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'milestone',          type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'documentAuthorType', type: 'string',  facet: true,  optional: true },
    { name: 'projectPhase',       type: 'string',  facet: true,  optional: true },
    { name: 'legislation',        type: 'int32',   facet: true,  optional: true },
    // Metadata
    { name: 'projectId',          type: 'string',  facet: true,  optional: true },
    { name: 'internalExt',        type: 'string',               optional: true },
    { name: 'datePosted',         type: 'int64',   sort: true,   optional: true },
    { name: 'dateUploaded',       type: 'int64',   sort: true,   optional: true },
    // Featured flag — shown on project's Featured Documents tab
    { name: 'isFeatured',         type: 'bool',                  optional: true },
    // Source of the document (e.g. 'COMMENT', 'DOCUMENT') — used as a filter
    { name: 'documentSource',     type: 'string',  facet: true,  optional: true },
    // 30-day click/download score — updated nightly by popularity-sync.js
    { name: 'popularity',         type: 'int32',   sort: true,   optional: true },
    // Access control — roles that may see this document (mirrors MongoDB read array)
    { name: 'allowed_roles',      type: 'string[]', facet: true,  optional: true },
  ],
};

const PROJECT_SCHEMA = {
  name: 'projects',
  fields: [
    { name: 'id',               type: 'string' },
    { name: 'name',             type: 'string',  index: true,  sort: true,  optional: true },
    { name: 'displayName',      type: 'string',  index: true,  optional: true },
    { name: 'description',      type: 'string',  index: true,  optional: true },
    { name: 'epicProjectId',    type: 'string',  index: true,  optional: true },
    // Filter + facet fields
    { name: 'region',           type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'status',           type: 'string',  facet: true,  optional: true },
    { name: 'currentPhaseName', type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'eacDecision',      type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'type',             type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'sector',           type: 'string',  facet: true,  optional: true },
    { name: 'location',         type: 'string',               optional: true },
    // Proponent name stored for display / search
    { name: 'proponent',        type: 'string',  index: true,  sort: true,  optional: true },
    { name: 'updatedDate',      type: 'int64',   sort: true,   optional: true },
    { name: 'decisionDate',     type: 'int64',   sort: true,   optional: true },
    // [lng, lat] centroid for map thumbnail in search results
    { name: 'centroid',         type: 'float[]',               optional: true },
    // 30-day click score — updated nightly by popularity-sync.js
    { name: 'popularity',       type: 'int32',   sort: true,   optional: true },
    // Access control — roles that may see this project (mirrors MongoDB read array)
    { name: 'allowed_roles',    type: 'string[]', facet: true,  optional: true },
  ],
};

const RECENTACTIVITY_SCHEMA = {
  name: 'activities',
  fields: [
    { name: 'id',                       type: 'string' },
    // Search fields
    { name: 'headline',                 type: 'string',  index: true,  optional: true },
    { name: 'content',                  type: 'string',  index: true,  optional: true },
    { name: 'notificationName',         type: 'string',  index: true,  optional: true },
    // Facet
    { name: 'type',                     type: 'string',  facet: true,  optional: true },
    // Metadata
    { name: 'projectId',                type: 'string',  facet: true,  optional: true },
    { name: 'projectName',              type: 'string',               optional: true },
    { name: 'active',                   type: 'bool',                 optional: true },
    { name: 'pinned',                   type: 'bool',    sort: true,   optional: true },
    { name: 'complianceAndEnforcement', type: 'bool',                 optional: true },
    { name: 'documentUrl',              type: 'string',               optional: true },
    { name: 'contentUrl',               type: 'string',               optional: true },
    // Original HTML stored for display (not indexed — stripped version in content)
    { name: 'contentHtml',              type: 'string',  index: false, optional: true },
    { name: 'dateAdded',                type: 'int64',   sort: true,   optional: true },
    // PCP (Comment Period) fields — needed for "View Engagement" button routing
    { name: 'pcpId',                    type: 'string',               optional: true },
    { name: 'pcpIsMet',                 type: 'bool',                 optional: true },
    { name: 'pcpMetURL',                type: 'string',               optional: true },
    // ProjectNotification ref — used by the Updates tab to fetch inline documents
    { name: 'projectNotificationId',    type: 'string',               optional: true },
    // Access control — roles that may see this activity (mirrors MongoDB read array)
    { name: 'allowed_roles',            type: 'string[]', facet: true,  optional: true },
  ],
};

const PROJECTNOTIFICATION_SCHEMA = {
  name: 'notifications',
  fields: [
    { name: 'id',                          type: 'string' },
    // Search fields
    { name: 'name',                        type: 'string',  index: true,  sort: true,  optional: true },
    { name: 'description',                 type: 'string',  index: true,  optional: true },
    { name: 'proponent',                   type: 'string',  index: true,  sort: true,  optional: true },
    { name: 'associatedProjectName',       type: 'string',  index: true,  optional: true },
    { name: 'region',                      type: 'string',  facet: true,  index: true,  sort: true,  optional: true },
    { name: 'location',                    type: 'string',  index: true,  optional: true },
    // Facet / filter fields
    { name: 'type',                        type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'subType',                     type: 'string',  facet: true,  sort: true,  optional: true },
    { name: 'trigger',                     type: 'string',  facet: true,  optional: true },
    { name: 'decision',                    type: 'string',  facet: true,  optional: true },
    { name: 'pcp',                         type: 'string',  facet: true,  optional: true },
    // Dates
    { name: 'notificationReceivedDate',    type: 'int64',   sort: true,   optional: true },
    { name: 'decisionDate',                type: 'int64',   sort: true,   optional: true },
    // Metadata
    { name: 'associatedProjectId',         type: 'string',               optional: true },
    { name: 'centroid',                    type: 'float[]',               optional: true },
    // Original HTML for display (not indexed)
    { name: 'descriptionHtml',             type: 'string',  index: false, optional: true },
    // Access control — roles that may see this notification (mirrors MongoDB read array)
    { name: 'allowed_roles',               type: 'string[]', facet: true,  optional: true },
  ],
};

const DOCUMENT_CHUNKS_SCHEMA = {
  name: 'document_chunks',
  fields: [
    { name: 'id',           type: 'string' },
    // Search field — indexed for full-text search
    { name: 'content',      type: 'string',  index: true },
    // Grouping / filtering — indexed
    { name: 'documentId',   type: 'string',  facet: true },
    { name: 'projectId',    type: 'string',  facet: true },
    { name: 'pageNumber',   type: 'int32',   sort: true },
    // Facet / display
    { name: 'documentType', type: 'string',  facet: true, optional: true },
    { name: 'datePosted',   type: 'int64',   sort: true,  optional: true },
    // Display-only — not indexed to save RAM
    { name: 'chunkIndex',     type: 'int32',   index: false, optional: true },
    { name: 'documentName',   type: 'string',  index: false, optional: true },
    { name: 'projectName',    type: 'string',  index: false, optional: true },
    // Access control — inherited from parent document's read array
    { name: 'allowed_roles',  type: 'string[]', facet: true,  optional: true },
    // Future: embedding field for vector/AI search
    // { name: 'embedding', type: 'float[]', num_dim: 768, optional: true },
  ],
};

/** Map _schemaName → Typesense schema */
const SCHEMAS = {
  Document:            DOCUMENT_SCHEMA,
  Project:             PROJECT_SCHEMA,
  RecentActivity:      RECENTACTIVITY_SCHEMA,
  ProjectNotification: PROJECTNOTIFICATION_SCHEMA,
  DocumentChunk:       DOCUMENT_CHUNKS_SCHEMA,
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
  RecentActivity: {
    fields:  'headline,content,notificationName',
    weights: '9000,8000,3000',
  },
  ProjectNotification: {
    fields:  'name,description,proponent,associatedProjectName,region,location',
    weights: '9000,8000,3000,2000,1500,1000',
  },
  DocumentChunk: {
    fields:  'content',
    weights: '9000',
  },
};

/**
 * Facet fields to include in every search response, keyed by schemaName.
 */
const FACET_BY = {
  Document:            'type,milestone,documentAuthorType,projectPhase,legislation,documentSource',
  Project:             'region,status,currentPhaseName,eacDecision,type,sector',
  RecentActivity:      'type',
  ProjectNotification: 'type,region,decision,pcp',
  DocumentChunk:       'documentType,projectId',
};

module.exports = { SCHEMAS, QUERY_BY, FACET_BY };
