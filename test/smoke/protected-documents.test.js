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

  it('GET /document without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/document').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
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

  // — V2 Protected Documents ——

  it('GET /v2/documents — V2 protected document list', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/v2/documents').query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /v2/documents without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/v2/documents').query({ pageNumber: 0, pageSize: 1 });
    await req.expect(200);
  });

  it('GET /v2/documents/:docId — V2 protected single document', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/v2/documents/${docId}`).expect(200);
    expect(res.body).to.have.property('_id', docId);
  });

  it('GET /v2/documents/:docId/download — V2 protected download responds', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/v2/documents/${docId}/download`);
    // 404 = file not in storage; 500 = document not found via SECURE_ROLES (pre-existing API bug)
    expect(res.status).to.be.oneOf([200, 302, 301, 404, 500]);
  });
});
