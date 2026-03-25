'use strict';

const { expect } = require('chai');
const { get, resolveOrgId } = require('./helpers');

describe('PUBLIC /api/public/recentActivity, /api/public/organization, /api/reports', () => {
  let orgId;

  before(async () => {
    orgId = await resolveOrgId();
  });

  // — Recent Activity ——

  it('GET /public/recentActivity — lists recent activities', async () => {
    const res = await get('/public/recentActivity').expect(200);
    expect(res.body).to.be.an('array');
  });

  // — Organizations ——

  it('GET /public/organization — lists organizations', async () => {
    const res = await get('/public/organization').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id');
  });

  it('GET /public/organization/:orgId — returns a specific organization', async () => {
    const res = await get(`/public/organization/${orgId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', orgId);
  });

  it('GET /public/organization/:orgId — returns empty array for unknown id', async () => {
    // API returns 200 with empty array rather than 404 for unknown IDs
    const res = await get('/public/organization/000000000000000000000000').expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(0);
  });

  // — Reports ——

  it('GET /reports?type=bcgw — generates BCGW report (200 or file response)', async () => {
    // This endpoint generates a CSV file download — just verify it doesn't 500
    const res = await get('/reports').query({ type: 'bcgw' });
    expect(res.status).to.be.oneOf([200, 302]);
  });
});
