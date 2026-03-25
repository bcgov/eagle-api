/**
 * Eagle API Smoke Test Helpers
 *
 * Usage:
 *   # Public endpoints only (no auth needed)
 *   yarn test:smoke:public
 *
 *   # Against a different environment
 *   SMOKE_TEST_URL=https://eagle-test.apps.silver.devops.gov.bc.ca yarn test:smoke:public
 *
 *   # Full suite (public + protected reads + write auth gates)
 *   SMOKE_TEST_TOKEN=<bearer-token> yarn test:smoke
 *
 *   # Full suite against production
 *   SMOKE_TEST_URL=https://projects.eao.gov.bc.ca SMOKE_TEST_TOKEN=<token> yarn test:smoke
 *
 * Environment variables:
 *   SMOKE_TEST_URL    Base URL of the API (default: https://eagle-dev.apps.silver.devops.gov.bc.ca)
 *   SMOKE_TEST_TOKEN  Bearer token for protected endpoints (optional)
 */

const request = require('supertest');
const { expect } = require('chai');

const BASE_URL = process.env.SMOKE_TEST_URL || 'https://eagle-dev.apps.silver.devops.gov.bc.ca';
const TOKEN = process.env.SMOKE_TEST_TOKEN || null;
const API = `${BASE_URL}/api`;

/** Whether a token is available for protected endpoint tests */
const hasToken = () => Boolean(TOKEN);

/**
 * Returns a supertest agent pointed at the base URL.
 * supertest accepts a full base URL string directly.
 */
const agent = () => request(API);

/**
 * Make an unauthenticated GET request.
 * @param {string} path  - API path relative to /api, e.g. '/public/project'
 * @returns {import('supertest').Test}
 */
const get = (path) => agent().get(path);

/**
 * Make an authenticated GET request.
 * If TOKEN is not set the request is sent without Authorization header
 * and the caller should expect a 401.
 * @param {string} path
 * @returns {import('supertest').Test}
 */
const authGet = (path) => {
  const req = agent().get(path);
  if (TOKEN) req.set('Authorization', `Bearer ${TOKEN}`);
  return req;
};

/**
 * Make an authenticated write request (POST/PUT/DELETE) — used only to verify
 * auth gating. Does NOT include a body so writes will fail with 400/422 when
 * auth passes, but that's fine — we only care about 401 when no token.
 * @param {'POST'|'PUT'|'DELETE'} method
 * @param {string} path
 * @returns {import('supertest').Test}
 */
const authWrite = (method, path, body = {}) => {
  const req = agent()[method.toLowerCase()](path).set('Content-Type', 'application/json');
  if (TOKEN) req.set('Authorization', `Bearer ${TOKEN}`);
  return req.send(body);
};

// ---------------------------------------------------------------------------
// Cached sample IDs — populated lazily by resolve* helpers
// ---------------------------------------------------------------------------

let _projId = null;
let _docId = null;
let _commentId = null;
let _commentPeriodId = null;
let _orgId = null;
let _recentActivityId = null;

async function resolveProjectId() {
  if (_projId) return _projId;
  const res = await get('/public/project').query({ pageNum: 0, pageSize: 1, fields: '_id' }).expect(200);
  const data = Array.isArray(res.body) ? res.body : [];
  _projId = data[0] && data[0]._id ? data[0]._id : null;
  if (!_projId) throw new Error('Could not resolve a sample project ID from /api/public/project');
  return _projId;
}

async function resolveDocId() {
  if (_docId) return _docId;
  const res = await get('/public/search').query({ dataset: 'Document', pageNum: 0, pageSize: 1 }).expect(200);
  const body = Array.isArray(res.body) && res.body[0] ? res.body[0] : {};
  const results = body.searchResults || [];
  _docId = results[0] && results[0]._id ? results[0]._id : null;
  if (!_docId) throw new Error('Could not resolve a sample document ID');
  return _docId;
}

async function resolveCommentPeriodId() {
  if (_commentPeriodId) return _commentPeriodId;
  const res = await get('/public/commentperiod').query({ pageNum: 0, pageSize: 1, fields: '_id' }).expect(200);
  const data = Array.isArray(res.body) ? res.body : [];
  _commentPeriodId = data[0] && data[0]._id ? data[0]._id : null;
  if (!_commentPeriodId) throw new Error('Could not resolve a sample comment period ID');
  return _commentPeriodId;
}

async function resolveCommentId() {
  if (_commentId) return _commentId;
  const periodId = await resolveCommentPeriodId();
  const res = await get('/public/comment').query({ period: periodId, pageNum: 0, pageSize: 1, fields: '_id' }).expect(200);
  const data = Array.isArray(res.body) ? res.body : [];
  _commentId = data[0] && data[0]._id ? data[0]._id : null;
  // Comments can be empty — that's OK, just won't test individual comment
  return _commentId;
}

async function resolveOrgId() {
  if (_orgId) return _orgId;
  const res = await get('/public/organization').query({ pageNum: 0, pageSize: 1, fields: '_id' }).expect(200);
  const data = Array.isArray(res.body) ? res.body : [];
  _orgId = data[0] && data[0]._id ? data[0]._id : null;
  if (!_orgId) throw new Error('Could not resolve a sample organization ID');
  return _orgId;
}

/**
 * Assert a response has a valid JSON search result envelope:
 *   [ { searchResults: [...], meta: [{ searchResultsTotal: N }] } ]
 */
function expectSearchEnvelope(res) {
  expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  const envelope = res.body[0];
  expect(envelope).to.have.property('searchResults').that.is.an('array');
  expect(envelope).to.have.property('meta').that.is.an('array');
  expect(envelope.meta[0]).to.have.property('searchResultsTotal').that.is.a('number');
}

module.exports = {
  BASE_URL,
  API,
  TOKEN,
  hasToken,
  get,
  authGet,
  authWrite,
  resolveProjectId,
  resolveDocId,
  resolveCommentPeriodId,
  resolveCommentId,
  resolveOrgId,
  expectSearchEnvelope,
};
