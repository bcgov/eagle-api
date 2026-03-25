'use strict';

const { expect } = require('chai');
const { authGet, hasToken, resolveProjectId, resolveOrgId } = require('./helpers');

describe('PROTECTED misc endpoints (requires token)', () => {
  let projId;
  let orgId;

  before(async function () {
    if (!hasToken()) return this.skip();
    projId = await resolveProjectId();
    orgId = await resolveOrgId();
  });

  // — Organizations ——

  it('GET /organization — lists organizations (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/organization').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /organization without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/organization');
    await req.expect(401);
  });

  it('GET /organization/:orgId — returns specific organization', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/organization/${orgId}`);
    // project-system-admin scope required; staff may get 403
    expect(res.status).to.be.oneOf([200, 403]);
    if (res.status === 200) {
      expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    }
  });

  // — Topics ——

  it('GET /topic — lists topics', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/topic').query({ pageNum: 0, pageSize: 5 });
    expect(res.status).to.be.oneOf([200, 403]);
    if (res.status === 200) expect(res.body).to.be.an('array');
  });

  it('GET /topic without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/topic');
    await req.expect(401);
  });

  // — Valued Components ——

  it('GET /vc?projectId=:id — lists valued components', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/vc').query({ projectId: projId, pageNum: 0, pageSize: 5 });
    expect(res.status).to.be.oneOf([200, 403]);
    if (res.status === 200) expect(res.body).to.be.an('array');
  });

  it('GET /vc without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/vc');
    await req.expect(401);
  });

  // — Project Notifications ——

  it('GET /projectNotification — lists notifications', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/projectNotification').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /projectNotification without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/projectNotification');
    await req.expect(401);
  });

  // — Recent Activity (protected write, read via public; just verify 401 without token) ——

  it('DELETE /recentActivity without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API)
      .delete('/recentActivity')
      .query({ applicationID: '000000000000000000000000' });
    await req.expect(401);
  });

  // — Search (protected) ——

  it('GET /search without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API).get('/search').query({ dataset: 'Project' });
    await req.expect(401);
  });

  // — V2 Project Groups ——

  it('GET /v2/projects/:projId/groups/:groupId/members without token — returns 401', async () => {
    const req = require('supertest')(require('./helpers').API)
      .get(`/v2/projects/${projId}/groups/000000000000000000000000/members`);
    await req.expect(401);
  });
});
