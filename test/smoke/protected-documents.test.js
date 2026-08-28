'use strict';

const { expect } = require('chai');
const { authGet, hasToken, resolveDocId } = require('./helpers');

describe('PROTECTED /api/document (requires token)', () => {
  let docId;

  before(async function () {
    if (!hasToken()) return this.skip();
    docId = await resolveDocId();
  });

  it('GET /document — lists all documents (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/document').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /document/:docId — returns specific document', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/document/${docId}`).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /document/:docId/download — protected download responds', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/document/${docId}/download`);
    // 404 is acceptable when file is not present in storage
    expect(res.status).to.be.oneOf([200, 302, 301, 404]);
  });

  it('GET /document/:docId/fetch — protected fetch responds', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/document/${docId}/fetch`);
    // 404 is acceptable when file is not present in storage
    expect(res.status).to.be.oneOf([200, 302, 301, 404]);
  });
});

// No credential needed, and none required to reach them: these assert what an
// unauthenticated caller gets. Gating them behind a token is what kept them from ever
// running, and the anonymous-GET leak they cover survived because of it.
describe('UNAUTHENTICATED documents endpoints', () => {
  // window.open from eagle-admin cannot attach a bearer, so these two must answer anonymously.
  it('GET /document/:docId/fetch without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API)
      .get('/document/000000000000000000000000/fetch');
    const res = await req;
    // 404 when the id does not exist; the point is that it is not refused.
    expect(res.status).to.not.equal(403);
  });

  it('GET /document without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/document').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });
});
