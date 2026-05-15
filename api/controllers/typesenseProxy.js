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

// These keys must NEVER come from the client — always server-injected only.
// Checked explicitly before the allowlist as defense-in-depth: if allowed_roles
// were ever accidentally added to ALLOWED_FILTER_KEYS, this catches it first.
const FORBIDDEN_FILTER_KEYS = new Set(['allowed_roles']);

// Client-supplied filter keys that are permitted to pass through.
// All other keys are dropped — including security-critical keys like allowed_roles
// which are intentionally absent here and always server-injected.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract roles from the swagger auth_payload (Keycloak JWT).
 * Always includes 'public' so authenticated users also see public content.
 */
function getRoles(args) {
  const payload = args.swagger.params.auth_payload;
  const roles = payload?.realm_access?.roles ? [...payload.realm_access.roles] : [];
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

    if (!ALLOWED_FILTER_KEYS.has(key)) {
      // Check forbidden keys first (defense-in-depth before allowlist)
      if (FORBIDDEN_FILTER_KEYS.has(key)) {
        defaultLog.warn('[TypesenseProxy] Dropping forbidden filter key from client request:', key);
      } else {
        defaultLog.warn('[TypesenseProxy] Dropping unknown filter key from client request:', key);
      }
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
  data?.hits?.forEach(hit => delete hit.document?.allowed_roles);
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
  for (const [k, v] of Object.entries(queryParams ?? {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }

  const options = {
    method: method || 'GET',
    headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_SEARCH_KEY },
    signal: AbortSignal.timeout(10000),
  };

  if (body) {
    options.body    = typeof body === 'string' ? body : JSON.stringify(body);
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

// Default values for every Typesense search query param.
const SEARCH_PARAM_DEFAULTS = {
  q:                     '*',
  query_by:              '',
  sort_by:               '',
  facet_by:              '',
  per_page:              '25',
  page:                  '1',
  highlight_fields:      '',
  highlight_full_fields: '',
  include_fields:        '',
  exclude_fields:        '',
  query_by_weights:      '',
  prefix:                '',
  num_typos:             '',
  typo_tokens_threshold: '',
  split_join_tokens:     '',
  highlight_start_tag:   '<mark>',
  highlight_end_tag:     '</mark>',
};

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

  // Build query params, injecting role filter
  const params = args.swagger.params;
  const query = Object.fromEntries(
    Object.entries(SEARCH_PARAM_DEFAULTS).map(([k, def]) => [k, params[k]?.value || def])
  );
  query.filter_by = injectRoleFilter(params.filter_by?.value, roleFilter);

  // Remove empty params — Typesense treats empty string differently from absent
  for (const k of Object.keys(query)) {
    if (query[k] == null || query[k] === '') delete query[k];
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

    data?.results?.forEach(stripAllowedRoles);

    return res.status(status).json(data);
  } catch (err) {
    defaultLog.error('[TypesenseProxy] Multi-search failed:', err.message);
    return res.status(503).json({ error: 'Search unavailable', message: err.message });
  }
}

exports.publicMultiSearch    = handleMultiSearch;
exports.protectedMultiSearch = handleMultiSearch;
