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
// collections.js is the single source of truth for schema, query fields and facets —
// shared by both the sync service (typesense-sync/) and this API helper.
const { QUERY_BY, FACET_BY } = require('../../typesense-sync/src/collections');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Typesense.Client({
      nodes: [{
        host:     process.env.TYPESENSE_HOST || 'typesense',
        port:     parseInt(process.env.TYPESENSE_PORT || '8108', 10),
        protocol: 'http',
      }],
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
 */
function buildFilterBy(and) {
  if (!and || typeof and !== 'object' || Object.keys(and).length === 0) return '';

  const filters = [];
  for (const [key, value] of Object.entries(and)) {
    if (!value) continue;
    if (key === 'datePostedStart') {
      const ts = Math.floor(new Date(value).getTime() / 1000);
      if (!isNaN(ts)) filters.push(`datePosted:>=${ts}`);
    } else if (key === 'datePostedEnd') {
      const ts = Math.floor(new Date(value).getTime() / 1000);
      if (!isNaN(ts)) filters.push(`datePosted:<=${ts}`);
    } else {
      // Escape brackets in value for Typesense filter syntax
      const escaped = String(value).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
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
 * @returns {Array}            - result in eagle-api response shape
 */
async function search(schemaName, keywords, pageNum, pageSize, sortBy, and) {
  const client    = getClient();
  const queryBy   = QUERY_BY[schemaName];
  const facetBy   = FACET_BY[schemaName] || '';
  const aliasName = schemaName.toLowerCase() + 's';  // 'projects'

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

  const filterBy = buildFilterBy(and);
  if (filterBy) searchParams.filter_by = filterBy;

  const result = await client.collections(aliasName).documents().search(searchParams);

  const searchResults = result.hits.map(hit => {
    const doc = { ...hit.document };
    // Restore _id convention eagle-api consumers expect
    doc._id         = doc.id;
    doc._schemaName = schemaName;
    doc._highlights = hit.highlight || {};
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
