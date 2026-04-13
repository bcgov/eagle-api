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
 * Generate a scoped search-only API key for one or more collections.
 * Used via the /api/search/scoped-key endpoint (Phase 3, step 11).
 *
 * The key is safe to expose to the browser — it cannot write or delete.
 */
async function createScopedSearchKey(collections = ['projects']) {
  const client = getClient();
  return client.keys().create({
    description: `eagle-public search-only key (${new Date().toISOString()})`,
    actions:     ['documents:search'],
    collections,
  });
}

module.exports = { search, createScopedSearchKey, buildFilterBy, buildSortBy };
