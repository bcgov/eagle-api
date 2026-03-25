'use strict';

const { expect } = require('chai');
const { get, resolveDocId } = require('./helpers');

describe('PUBLIC /api/public/document', () => {
  let docId;

  before(async () => {
    docId = await resolveDocId();
  });

  it('GET /public/document — lists documents', async () => {
    const res = await get('/public/document').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    const doc = res.body[0];
    expect(doc).to.have.property('_id');
  });

  it('GET /public/document — supports docIds query', async () => {
    const res = await get('/public/document').query({ docIds: docId }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', docId);
  });

  it('GET /public/document/:docId — returns a specific document', async () => {
    const res = await get(`/public/document/${docId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', docId);
  });

  it('GET /public/document/:docId — returns empty array for unknown id', async () => {
    // API returns 200 with empty array rather than 404 for unknown IDs
    const res = await get('/public/document/000000000000000000000000').expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(0);
  });

  it('GET /public/document/:docId/download — responds (200, 302, or 404)', async () => {
    // File may not exist in MinIO on dev; allow 404 as well as success
    const res = await get(`/public/document/${docId}/download`);
    expect(res.status).to.be.oneOf([200, 302, 301, 404]);
  });

  it('GET /v2/public/documents — V2 document list', async () => {
    // V2 list returns search envelope: [{ searchResults: [...], meta: [...] }]
    const res = await get('/v2/public/documents').query({ pageNumber: 0, pageSize: 3 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(1);
    expect(res.body[0]).to.have.property('searchResults').that.is.an('array').with.lengthOf.at.least(1);
  });

  it('GET /v2/public/documents/:docId — V2 single document', async () => {
    const res = await get(`/v2/public/documents/${docId}`).expect(200);
    expect(res.body).to.have.property('_id', docId);
  });

  it('GET /v2/public/documents/:docId/download — V2 download responds', async () => {
    // File may not exist in MinIO on dev; allow 404 or 500 (MinIO connection error)
    const res = await get(`/v2/public/documents/${docId}/download`);
    expect(res.status).to.be.oneOf([200, 302, 301, 404, 500]);
  });
});
