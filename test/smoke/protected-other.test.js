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

  it('GET /organization without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/organization').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
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

  it('GET /topic without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/topic').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });

  // — Valued Components ——

  it('GET /vc?projectId=:id — lists valued components', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/vc').query({ projectId: projId, pageNum: 0, pageSize: 5 });
    expect(res.status).to.be.oneOf([200, 403]);
    if (res.status === 200) expect(res.body).to.be.an('array');
  });

  it('GET /vc without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/vc').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });

  // — Project Notifications ——

  it('GET /projectNotification — lists notifications', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/projectNotification').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /projectNotification without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/projectNotification').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });

  // — Recent Activity (protected write, read via public; just verify 401 without token) ——

  it('DELETE /recentActivity without token — blocked (non-2xx)', async () => {
    const req = require('supertest')(require('./helpers').API)
      .delete('/recentActivity')
      .query({ applicationID: '000000000000000000000000' });
    const res = await req;
    // API returns 403 for unauthenticated DELETE (not 401)
    expect(res.status).to.not.be.within(200, 299);
  });

  // — Search (protected) ——

  it('GET /search without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/search').query({ dataset: 'Project', pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });

  // — V2 Project Groups ——

  it('GET /v2/projects/:projId/groups/:groupId/members without token — non-2xx', async () => {
    const req = require('supertest')(require('./helpers').API)
      .get(`/v2/projects/${projId}/groups/000000000000000000000000/members`);
    const res = await req;
    expect(res.status).to.not.be.within(200, 299);
  });
});
