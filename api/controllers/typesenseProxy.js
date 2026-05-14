'use strict';

/**
 * Typesense Search Proxy
 *
 * ALL Typesense queries from the browser route through these endpoints.
 * The search-only API key NEVER leaves this process — clients receive only results.
 *
 * Role injection:
 *   - Public (no JWT) → roles = ['public']
 *   - Authenticated   → roles = JWT realm_access.roles (+ 'public' always appended)
 *
 * The role filter is prepended to every query's filter_by before forwarding to
 * Typesense. Clients cannot override or remove it — any client-supplied
 * allowed_roles filter is stripped before injection.
 *
 * Public routes  (no JWT):  /api/public/typesense/*
 * Protected routes (JWT):   /api/typesense/*
 */

const defaultLog = require('winston').loggers.get('default');

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPESENSE_HOST = process.env.TYPESENSE_HOST || 'typesense';
const TYPESENSE_PORT = process.env.TYPESENSE_PORT || '8108';
const TYPESENSE_SEARCH_KEY = process.env.TYPESENSE_SEARCH_KEY;
const TYPESENSE_BASE_URL = `http://${TYPESENSE_HOST}:${TYPESENSE_PORT}`;

// Only proxy known collections — rejects attempts to enumerate unknown collections.
const ALLOWED_COLLECTIONS = new Set([
  'projects', 'documents', 'activities', 'notifications', 'document_chunks',
]);

// Client-supplied filter keys that are permitted to pass through.
// All other keys are dropped. Prevents filter injection via operator-bearing key names.
const ALLOWED_FILTER_KEYS = new Set([
  // projects
  'region', 'type', 'currentPhaseName', 'eacDecision', 'decisionDate',
  // documents
  'milestone', 'documentAuthorType', 'projectPhase', 'datePosted',
  // activities (no user-filterable facets beyond type)
  // notifications
  'subType', 'decision', 'trigger', 'pcp', 'notificationReceivedDate',
  // document chunks
  'documentType',
  // shared / legacy
  'legislation', 'documentSource', 'status',
  'sector', 'projectId', 'documentId', 'datePostedStart', 'datePostedEnd',
  'active', 'isFeatured', 'pinned', 'complianceAndEnforcement',
]);

// These keys must NEVER come from client — always server-injected only.
const FORBIDDEN_FILTER_KEYS = new Set(['allowed_roles']);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract roles from the swagger auth_payload (Keycloak JWT).
 * Always includes 'public' so authenticated users also see public content.
 */
function getRoles(args) {
  const payload = args.swagger.params.auth_payload;
  if (!payload) return ['public'];
  const roles = payload.realm_access && Array.isArray(payload.realm_access.roles)
    ? [...payload.realm_access.roles]
    : [];
  if (!roles.includes('public')) roles.push('public');
  return roles;
}

/**
 * Build the mandatory role filter string.
 * Format: allowed_roles:=[role1,role2]
 */
function buildRoleFilter(roles) {
  return `allowed_roles:=[${roles.join(',')}]`;
}

/**
 * Sanitize a client-supplied filter_by string:
 *  1. Strip any clause whose key is in FORBIDDEN_FILTER_KEYS
 *  2. Strip any clause whose key is NOT in ALLOWED_FILTER_KEYS
 *  3. Validate remaining clause values against a safe-value pattern
 *
 * Clauses are split on ' && '. Each clause starts with a key followed by
 * a colon and operator (e.g. "type:=Report" or "datePosted:>=1704067200").
 *
 * Returns sanitized filter string (may be empty string).
 */
function sanitizeFilterBy(rawFilter) {
  if (!rawFilter || typeof rawFilter !== 'string') return '';

  const clauses = rawFilter.split(/\s*&&\s*/);
  const safe = [];

  for (const clause of clauses) {
    const colonIdx = clause.indexOf(':');
    if (colonIdx === -1) continue;

    const key = clause.slice(0, colonIdx).trim();
    const rest = clause.slice(colonIdx + 1).trim();

    // Drop forbidden keys regardless of context
    if (FORBIDDEN_FILTER_KEYS.has(key)) {
      defaultLog.warn('[TypesenseProxy] Dropping forbidden filter key from client request:', key);
      continue;
    }

    // Drop unknown keys
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      defaultLog.warn('[TypesenseProxy] Dropping unknown filter key from client request:', key);
      continue;
    }

    // Basic value sanity — allow alphanumeric, spaces, hyphens, brackets, colons, commas,
    // backticks (Typesense adapter wraps all string values in backticks), parens, & and '
    // (legal in project/phase names). FORBIDDEN_FILTER_KEYS is the primary injection guard.
    if (!/^[=<>![\],\w\s\-:.+/*`()&']+$/.test(rest)) {
      defaultLog.warn('[TypesenseProxy] Dropping clause with unsafe value:', clause);
      continue;
    }

    safe.push(`${key}:${rest}`);
  }

  return safe.join(' && ');
}

/**
 * Inject the role filter into a single search's filter_by, stripping any
 * client-supplied allowed_roles references first.
 */
function injectRoleFilter(existingFilter, roleFilter) {
  const sanitized = sanitizeFilterBy(existingFilter || '');
  return sanitized ? `${roleFilter} && ${sanitized}` : roleFilter;
}

/**
 * Strip allowed_roles from all document hits in a Typesense response.
 */
function stripAllowedRoles(data) {
  if (!data || !Array.isArray(data.hits)) return data;
  for (const hit of data.hits) {
    if (hit.document) delete hit.document.allowed_roles;
  }
  return data;
}

/**
 * Forward a request to Typesense and return the parsed JSON response.
 * Uses native fetch (available in Node 18+).
 */
async function forwardToTypesense(path, method, queryParams, body) {
  if (!TYPESENSE_SEARCH_KEY) {
    throw new Error('TYPESENSE_SEARCH_KEY not configured');
  }

  const url = new URL(`${TYPESENSE_BASE_URL}${path}`);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const options = {
    method: method || 'GET',
    headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY },
    signal: AbortSignal.timeout(10000),
  };

  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
    options.headers['Content-Type'] = 'application/json';
  }

  const tsRes = await fetch(url.toString(), options);
  const json = await tsRes.json();
  return { status: tsRes.status, data: json };
}

// ── Health ────────────────────────────────────────────────────────────────────

exports.publicHealth = async function (args, res) {
  try {
    // Health is a public endpoint — no API key required
    const tsRes = await fetch(`${TYPESENSE_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await tsRes.json();
    return res.status(tsRes.status).json(data);
  } catch (err) {
    defaultLog.warn('[TypesenseProxy] Health check failed:', err.message);
    return res.status(503).json({ ok: false, error: err.message });
  }
};

// ── Single Collection Search ──────────────────────────────────────────────────

/**
 * Core handler for single-collection search (GET).
 * Shared by public and protected routes.
 */
async function handleCollectionSearch(args, res) {
  const collection = args.swagger.params.collection.value;
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return res.status(404).json({ error: `Unknown collection: ${collection}` });
  }

  const roles      = getRoles(args);
  const roleFilter = buildRoleFilter(roles);

  // Build query params to forward, injecting role filter
  const params = args.swagger.params;
  const query = {
    q:                  params.q?.value          || '*',
    query_by:           params.query_by?.value    || '',
    filter_by:          injectRoleFilter(params.filter_by?.value, roleFilter),
    sort_by:            params.sort_by?.value     || '',
    facet_by:           params.facet_by?.value    || '',
    per_page:           params.per_page?.value    || '25',
    page:               params.page?.value        || '1',
    highlight_fields:   params.highlight_fields?.value || '',
    highlight_full_fields: params.highlight_full_fields?.value || '',
    include_fields:     params.include_fields?.value || '',
    exclude_fields:     params.exclude_fields?.value || '',
    query_by_weights:   params.query_by_weights?.value || '',
    prefix:             params.prefix?.value      || '',
    num_typos:          params.num_typos?.value   || '',
    typo_tokens_threshold: params.typo_tokens_threshold?.value || '',
    split_join_tokens:  params.split_join_tokens?.value || '',
    highlight_start_tag: params.highlight_start_tag?.value || '<mark>',
    highlight_end_tag:   params.highlight_end_tag?.value  || '</mark>',
  };

  // Remove empty params — Typesense treats empty string differently from absent
  for (const k of Object.keys(query)) {
    if (query[k] === '' || query[k] === null || query[k] === undefined) delete query[k];
  }

  try {
    const { status, data } = await forwardToTypesense(
      `/collections/${collection}/documents/search`,
      'GET',
      query,
      null
    );
    stripAllowedRoles(data);
    return res.status(status).json(data);
  } catch (err) {
    defaultLog.error('[TypesenseProxy] Search failed:', err.message);
    return res.status(503).json({ error: 'Search unavailable', message: err.message });
  }
}

exports.publicCollectionSearch    = handleCollectionSearch;
exports.protectedCollectionSearch = handleCollectionSearch;

// ── Multi Search ──────────────────────────────────────────────────────────────

/**
 * Core handler for multi_search (POST).
 * Shared by public and protected routes.
 *
 * Typesense multi_search body format:
 * {
 *   "searches": [
 *     { "collection": "projects", "q": "*", "query_by": "name", "filter_by": "..." },
 *     ...
 *   ]
 * }
 */
async function handleMultiSearch(args, res) {
  const body = args.swagger.params.body?.value;
  if (!body || !Array.isArray(body.searches)) {
    return res.status(400).json({ error: 'Invalid multi_search body' });
  }

  const roles      = getRoles(args);
  const roleFilter = buildRoleFilter(roles);

  const cleanSearches = body.searches.map(s => {
    const collection = s.collection || '';
    if (!ALLOWED_COLLECTIONS.has(collection)) {
      return { ...s, filter_by: 'id:=__never__' };
    }
    const clean = { ...s, filter_by: injectRoleFilter(s.filter_by, roleFilter) };
    // Paranoia: prevent client from searching the allowed_roles field directly
    if (clean.query_by === 'allowed_roles') clean.query_by = 'name';
    return clean;
  });

  try {
    const { status, data } = await forwardToTypesense(
      '/multi_search',
      'POST',
      null,
      { searches: cleanSearches }
    );

    // Strip allowed_roles from every result set
    if (data && Array.isArray(data.results)) {
      for (const result of data.results) {
        stripAllowedRoles(result);
      }
    }

    return res.status(status).json(data);
  } catch (err) {
    defaultLog.error('[TypesenseProxy] Multi-search failed:', err.message);
    return res.status(503).json({ error: 'Search unavailable', message: err.message });
  }
}

exports.publicMultiSearch    = handleMultiSearch;
exports.protectedMultiSearch = handleMultiSearch;
