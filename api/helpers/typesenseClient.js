'use strict';

/**
 * Typesense client singleton for eagle-api search controller.
 *
 * Configuration (all from environment / ConfigMap):
 *   TYPESENSE_HOST         - Typesense service hostname (default: typesense)
 *   TYPESENSE_PORT         - Typesense service port    (default: 8108)
 *   TYPESENSE_API_KEY      - Admin or search-only API key
 */

const Typesense = require('typesense');

/**
 * Query_by fields and their weights for each schema, used in search requests.
 * Weights mirror the MongoDB searchIndex_1 text index weights.
 *
 * Source of truth: eagle-typesense repo (src/collections.js).
 * Keep in sync when schemas change.
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

let _client = null;

function getClient() {
  if (!_client) {
    const hosts = (process.env.TYPESENSE_HOST || 'typesense').split(',');
    const nodes = hosts.map(h => ({
      host:     h.trim(),
      port:     parseInt(process.env.TYPESENSE_PORT || '8108', 10),
      protocol: 'http',
    }));
    _client = new Typesense.Client({
      nodes,
      apiKey:                   process.env.TYPESENSE_API_KEY,
      connectionTimeoutSeconds: 5,
      retryIntervalSeconds:     2,
      numRetries:               2,
    });
  }
  return _client;
}

/**
 * Translate the search controller's `and` parameter (object or empty string)
 * into a Typesense filter_by string.
 *
 * Handles:
 *  - Equality filters:  and[milestone]=EA Certificate  → milestone:=[EA Certificate]
 *  - Date range start:  and[datePostedStart]=2024-01-01 → datePosted:>=1704067200
 *  - Date range end:    and[datePostedEnd]=2024-12-31   → datePosted:<=1735603200
 *
 * Security: Keys are validated against ALLOWED_FILTER_KEYS to prevent filter
 * injection via Typesense operators (||, &&, :=) in user-controlled key names.
 */

// Whitelist of filter keys accepted from the and/or query parameters.
// Any key not in this set is silently dropped — prevents filter injection.
const ALLOWED_FILTER_KEYS = new Set([
  'milestone', 'type', 'documentAuthorType', 'projectPhase', 'legislation',
  'documentSource', 'region', 'status', 'currentPhaseName', 'eacDecision',
  'sector', 'projectId', 'datePostedStart', 'datePostedEnd',
]);

function buildFilterBy(and) {
  if (!and || typeof and !== 'object' || Object.keys(and).length === 0) return '';

  const filters = [];
  for (const [key, value] of Object.entries(and)) {
    if (!value) continue;
    // Reject keys not in whitelist — prevents filter_by injection via operators in key names
    if (!ALLOWED_FILTER_KEYS.has(key)) continue;
    if (key === 'datePostedStart') {
      const ts = Math.floor(new Date(value).getTime() / 1000);
      if (!isNaN(ts)) filters.push(`datePosted:>=${ts}`);
    } else if (key === 'datePostedEnd') {
      const ts = Math.floor(new Date(value).getTime() / 1000);
      if (!isNaN(ts)) filters.push(`datePosted:<=${ts}`);
    } else {
      // Escape backslashes, then brackets in value for Typesense filter syntax
      const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
      filters.push(`${key}:=[${escaped}]`);
    }
  }
  return filters.join(' && ');
}

/**
 * Translate sortBy array (e.g. ['-score', '-updatedDate']) to a Typesense sort_by string.
 *
 * Notes:
 *  - Typesense's text relevance score field is `_text_match` (leading underscore).
 *  - Default sort (no sortBy) uses updatedDate:desc for Projects.
 *  - Unknown sort fields will cause Typesense to throw → caught by caller → MongoDB fallback.
 */
function buildSortBy(sortBy) {
  if (!sortBy || sortBy.length === 0) return 'updatedDate:desc';

  const sort = Array.isArray(sortBy) ? sortBy[0] : sortBy;
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  const dir   = sort.startsWith('-') ? 'desc' : 'asc';

  // Map score → Typesense's _text_match pseudo-field
  if (field === 'score' || field === '') return '_text_match:desc,updatedDate:desc';

  return `${field}:${dir}`;
}

/**
 * Search Typesense and return results in eagle-api's standard response shape:
 *   [{ searchResults: [...], meta: [{ searchResultsTotal: N }] }]
 *
 * The envelope mirrors MongoDB's $facet output so callers (and tests)
 * see the same shape regardless of backend.
 *
 * @param {string} schemaName  - 'Document', 'Project', or 'Comment'
 * @param {string} keywords    - search query ('' or '*' for all)
 * @param {number} pageNum     - 0-based page number (eagle-api convention)
 * @param {number} pageSize    - results per page
 * @param {Array}  sortBy      - array of sort strings, e.g. ['-datePosted']
 * @param {object} and         - filter object
 * @param {string[]} roles     - user roles (e.g. ['public'] or ['sysadmin','staff','public'])
 * @returns {Array}            - result in eagle-api response shape
 */
async function search(schemaName, keywords, pageNum, pageSize, sortBy, and, roles) {
  const client    = getClient();
  const queryBy   = QUERY_BY[schemaName];
  const facetBy   = FACET_BY[schemaName] || '';
  const aliasName = schemaName.toLowerCase() + 's';  // 'projects'

  // Build role-based access control filter — only return docs whose
  // allowed_roles intersect with the caller's roles. This is the server-side
  // enforcement equivalent of MongoDB's $redact stage.
  const effectiveRoles = Array.isArray(roles) && roles.length > 0 ? roles : ['public'];
  const roleFilter = effectiveRoles.map(r => `allowed_roles:=${r}`).join(' || ');

  const searchParams = {
    q:                  keywords || '*',
    query_by:           queryBy.fields,
    query_by_weights:   queryBy.weights,
    sort_by:            buildSortBy(sortBy),
    facet_by:           facetBy,
    per_page:           pageSize || 25,
    page:               (pageNum || 0) + 1,   // Typesense is 1-indexed
    highlight_fields:   queryBy.fields,        // Highlight the same fields used for search
    highlight_start_tag: '<mark>',
    highlight_end_tag:  '</mark>',
    num_typos:          keywords ? 2 : 0,
    typo_tokens_threshold: 1,
  };

  // Combine role filter with facet filters
  const facetFilter = buildFilterBy(and);
  const parts = [roleFilter];
  if (facetFilter) parts.push(facetFilter);
  searchParams.filter_by = parts.join(' && ');

  const result = await client.collections(aliasName).documents().search(searchParams);

  const searchResults = result.hits.map(hit => {
    const doc = { ...hit.document };
    // Restore _id convention eagle-api consumers expect
    doc._id         = doc.id;
    doc._schemaName = schemaName;
    doc._highlights = hit.highlight || {};
    // Strip internal ACL field — never expose to clients
    delete doc.allowed_roles;
    return doc;
  });

  return [{
    searchResults,
    meta: [{
      searchResultsTotal: result.found,
    }],
  }];
}

/**
 * Generate a scoped search key with an embedded filter_by constraint.
 * Pure HMAC derivation — no network call to Typesense, no latency.
 *
 * The returned key is safe to expose to browsers: it is read-only and
 * Typesense enforces the embedded filter_by regardless of what the client sends.
 *
 * Requires TYPESENSE_SEARCH_KEY env var (search-only key, separate from the
 * admin TYPESENSE_API_KEY used by the sync service).
 *
 * @param {string[]} roles     - User roles from Keycloak JWT (e.g. ['public', 'staff'])
 * @param {number} [ttl=3600] - Key lifetime in seconds (default 1 hour)
 * @returns {{ key: string, expiresAt: number }} - Scoped key and its Unix expiry timestamp
 */
function generateScopedSearchKey(roles, ttl = 3600) {
  const searchKey = process.env.TYPESENSE_SEARCH_KEY;
  if (!searchKey) {
    throw new Error('TYPESENSE_SEARCH_KEY not configured — cannot generate scoped search key');
  }
  // Always include 'public' so scoped key also sees public content
  const effectiveRoles = roles.includes('public') ? roles : [...roles, 'public'];
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const client = getClient();
  const key = client.keys().generateScopedSearchKey(searchKey, {
    filter_by: `allowed_roles:=[${effectiveRoles.join(',')}]`,
    expires_at: expiresAt,
  });
  return { key, expiresAt };
}

module.exports = { search, generateScopedSearchKey, buildFilterBy, buildSortBy };
