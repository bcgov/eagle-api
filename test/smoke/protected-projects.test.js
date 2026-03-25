'use strict';

const { expect } = require('chai');
const { authGet, hasToken, resolveProjectId } = require('./helpers');

describe('PROTECTED /api/project (requires token)', () => {
  let projId;

  before(async function () {
    if (!hasToken()) return this.skip();
    projId = await resolveProjectId();
  });

  it('GET /project — lists all projects (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/project').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /project without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/project');
    const res = await req.expect(401);
  });

  it('GET /project/:projId — returns specific project (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/project/${projId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /project/:projId/pin — protected pins', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/project/${projId}/pin`).query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /project/:projId/FeaturedDocuments — protected featured docs', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/project/${projId}/FeaturedDocuments`).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /search?dataset=Project — protected search', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/search').query({ dataset: 'Project', pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /audit — audit log (sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/audit').query({ pageNum: 0, pageSize: 5 });
    // sysadmin-only — 403 is acceptable for a staff token
    expect(res.status).to.be.oneOf([200, 403]);
    if (res.status === 200) {
      expect(res.body).to.be.an('array');
    }
  });

  // — V2 Protected Projects ——

  it('GET /v2/Projects — V2 protected project list', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/v2/Projects').query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /v2/projects/:projId — V2 protected single project', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/v2/projects/${projId}`).expect(200);
    expect(res.body).to.have.property('_id', projId);
  });

  it('GET /v2/projects/:projId/documents — V2 protected project docs', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/v2/projects/${projId}/documents`).query({ pageNumber: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /v2/projects/:projId/pins — V2 protected pins', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/v2/projects/${projId}/pins`).query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });
});
