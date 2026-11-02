'use strict';

/**
 * Public /search against a live environment only returns documents with 'public' in read[].
 * The per-role read[] filter for staff and sysadmin is covered on real MongoDB in test/db/documentRead.test.js.
 *
 * Usage: yarn test:smoke
 */

const { TOKEN, API_KEY, get, authGet, resolveProjectId, resolveDocId } = require('./helpers');
const { expect } = require('chai');

describe('READ ACCESS CONTROL — search endpoint enforces document.read[] ACL', () => {

  // An empty CI secret would otherwise skip every authed check below without anyone seeing it.
  before(function () {
    if (process.env.CI && !TOKEN && !API_KEY) throw new Error('CI run has neither SMOKE_API_KEY nor SMOKE_TEST_TOKEN set');
  });

  // CI sets only the API key: prove it cannot reach project-system-admin search.
  describe('API key only — authed /search refused', function () {
    before(function () {
      if (TOKEN || !API_KEY) this.skip();
    });

    it('GET /search?dataset=Document with the API key returns 403', async () => {
      await authGet('/search').query({ dataset: 'Document', pageNum: 0, pageSize: 1 }).expect(403);
    });
  });

  before(async () => {
    // Ensure database has projects and documents seeded to prevent silent passes
    await Promise.all([
      resolveProjectId(),
      resolveDocId()
    ]);
  });

  describe('Public (unauthenticated) — should only see read:["public"] documents', () => {

    it('GET /public/search?dataset=Document — returns only publicly readable docs', async () => {
      const res = await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 25 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      expect(results.length, 'Should return at least one document').to.be.greaterThan(0);
      for (const doc of results) {
        expect(doc.read, `Document ${doc._id} visible to public but read=${JSON.stringify(doc.read)}`)
          .to.include('public');
      }
    });

    it('GET /public/search?dataset=Project — returns only published projects', async () => {
      const res = await get('/public/search')
        .query({ dataset: 'Project', pageNum: 0, pageSize: 25 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      expect(results.length, 'Should return at least one project').to.be.greaterThan(0);
      for (const proj of results) {
        expect(proj.read, `Project ${proj._id} visible to public but read=${JSON.stringify(proj.read)}`)
          .to.include('public');
      }
    });

    it('GET /public/search?dataset=Document — never returns staff-only docs', async () => {
      const res = await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 100 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      expect(results.length, 'Should return at least one document').to.be.greaterThan(0);
      for (const doc of results) {
        const hasPublic = doc.read && doc.read.includes('public');
        expect(hasPublic, `Document ${doc._id} leaked to public — read=${JSON.stringify(doc.read)}`)
          .to.be.true;
      }
    });

    it('pagination cap enforced — public cannot retrieve > 100 results', async () => {
      const res = await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 999 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      expect(results.length).to.be.at.most(100);
    });
  });

  describe('Negative pageSize — rejected', () => {
    it('public: pageSize=-1 returns 400', async () => {
      await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: -1 })
        .expect(400);
    });
  });
});
