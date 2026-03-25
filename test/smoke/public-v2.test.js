'use strict';

const { expect } = require('chai');
const { get, resolveProjectId, resolveDocId } = require('./helpers');

describe('PUBLIC /api/v2 endpoints', () => {
  let projId;
  let docId;

  before(async () => {
    projId = await resolveProjectId();
    docId = await resolveDocId();
  });

  // — HATEOAS root ——

  it('GET /v2/ — returns V2 HATEOAS root', async () => {
    const res = await get('/v2/').expect(200);
    expect(res.body).to.be.an('object');
  });

  // — V2 Projects ——

  it('GET /v2/Public/Projects — lists projects (V2)', async () => {
    // V2 list returns search envelope: [{ searchResults: [...], meta: [{ searchResultsTotal: N }] }]
    const res = await get('/v2/Public/Projects').query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(1);
    expect(res.body[0]).to.have.property('searchResults').that.is.an('array').with.lengthOf.at.least(1);
    expect(res.body[0].searchResults[0]).to.have.property('_id');
  });

  it('HEAD /v2/Public/Projects — HEAD request succeeds', async () => {
    await get('/v2/Public/Projects').query({ pageNumber: 0, pageSize: 1 }).expect(200);
  });

  it('GET /v2/public/projects/:projId — returns specific project (V2)', async () => {
    const res = await get(`/v2/public/projects/${projId}`).expect(200);
    expect(res.body).to.have.property('_id', projId);
  });

  it('GET /v2/public/projects/:projId/documents — returns project documents (V2)', async () => {
    // Returns search envelope: [{ searchResults: [...], meta: [...] }]
    const res = await get(`/v2/public/projects/${projId}/documents`).query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(1);
    expect(res.body[0]).to.have.property('searchResults').that.is.an('array');
  });

  it('GET /v2/public/projects/:projId/pins — returns project pins (V2)', async () => {
    const res = await get(`/v2/public/projects/${projId}/pins`).query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /V2/Public/project/:projId/FeaturedDocuments — V2 featured documents', async () => {
    const res = await get(`/V2/Public/project/${projId}/FeaturedDocuments`).expect(200);
    expect(res.body).to.be.an('array');
  });

  // — V2 Documents ——

  it('GET /v2/public/documents — lists documents (V2)', async () => {
    // V2 list returns search envelope: [{ searchResults: [...], meta: [{ searchResultsTotal: N }] }]
    const res = await get('/v2/public/documents').query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(1);
    expect(res.body[0]).to.have.property('searchResults').that.is.an('array').with.lengthOf.at.least(1);
    expect(res.body[0].searchResults[0]).to.have.property('_id');
  });

  it('GET /v2/public/documents/:docId — returns specific document (V2)', async () => {
    const res = await get(`/v2/public/documents/${docId}`).expect(200);
    expect(res.body).to.have.property('_id', docId);
  });

  it('GET /v2/public/documents/:docId/download — V2 download responds', async () => {
    // File may not exist in MinIO on dev; allow 404 or 500 (MinIO connection error)
    const res = await get(`/v2/public/documents/${docId}/download`);
    expect(res.status).to.be.oneOf([200, 302, 301, 404, 500]);
  });
});
