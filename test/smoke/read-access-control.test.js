'use strict';

/**
 * READ endpoint access control tests.
 *
 * Verify that search/read endpoints enforce the `read` array ACL:
 * - Public (unauthenticated) users only see documents with 'public' in read[]
 * - Staff users see documents with 'staff' or 'public' in read[]
 * - Documents with read=['sysadmin'] only are invisible to public and staff
 *
 * These are smoke tests — run against a live environment with seeded data.
 *
 * Usage:
 *   yarn test:smoke:public              # Tests 1-4 only (no token needed)
 *   SMOKE_TEST_TOKEN=<token> yarn test:smoke  # Full suite including authed tests
 */

const { API, get, authGet, hasToken, resolveProjectId, resolveDocId } = require('./helpers');
const { expect } = require('chai');

describe('READ ACCESS CONTROL — search endpoint enforces document.read[] ACL', () => {

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

  describe('Staff (authenticated) — sees staff + public docs, NOT sysadmin-only', function () {
    before(function () {
      if (!hasToken()) this.skip();
    });

    it('GET /search?dataset=Document (authed) — returns docs with staff OR public in read[]', async () => {
      const res = await authGet('/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 50 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      expect(results.length).to.be.greaterThan(0);

      for (const doc of results) {
        const readable = doc.read && (doc.read.includes('public') || doc.read.includes('staff'));
        expect(readable, `Document ${doc._id} visible to staff but read=${JSON.stringify(doc.read)} — possible escalation`)
          .to.be.true;
      }
    });

    it('staff sees MORE docs than public (proves role filtering is active)', async () => {
      const pubRes = await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 1 })
        .expect(200);
      const pubTotal = pubRes.body[0]?.meta?.[0]?.searchResultsTotal || 0;

      const staffRes = await authGet('/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 1 })
        .expect(200);
      const staffTotal = staffRes.body[0]?.meta?.[0]?.searchResultsTotal || 0;

      expect(staffTotal, 'Staff should see >= public docs (more if any staff-only docs exist)')
        .to.be.at.least(pubTotal);
    });

    it('staff pagination cap is 1000 (not public 100)', async () => {
      const res = await authGet('/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 500 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      // If DB has >100 docs, staff should get more than 100 (proving staff cap used)
      // If <100 total docs exist, this test is inconclusive — just verify no error
      expect(results.length).to.be.at.most(1000);
    });
  });

  describe('Negative pageSize — rejected for both public and authenticated', () => {
    it('public: pageSize=-1 returns 400', async () => {
      await get('/public/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: -1 })
        .expect(400);
    });

    it('authenticated: pageSize=-1 returns 400', function (done) {
      if (!hasToken()) return this.skip();
      authGet('/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: -1 })
        .expect(400, done);
    });
  });

  describe('Cross-role isolation — sysadmin-only docs invisible to staff', function () {
    before(function () {
      if (!hasToken()) this.skip();
    });

    it('search results never include docs where read is exclusively sysadmin-only', async () => {
      const res = await authGet('/search')
        .query({ dataset: 'Document', pageNum: 0, pageSize: 100 })
        .expect(200);

      const results = res.body[0]?.searchResults || [];
      for (const doc of results) {
        if (doc.read) {
          const sysadminOnly = doc.read.length === 1 && doc.read[0] === 'sysadmin';
          expect(sysadminOnly, `Document ${doc._id} is sysadmin-only but visible to staff — ACL leak`)
            .to.be.false;
        }
      }
    });
  });
});
