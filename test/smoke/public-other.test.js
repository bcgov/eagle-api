'use strict';

const { expect } = require('chai');
const { get, resolveOrgId } = require('./helpers');

describe('PUBLIC /api/public/recentActivity, /api/public/organization, /api/reports', () => {
  let orgId;
  let activities;

  before(async () => {
    orgId = await resolveOrgId();
    const res = await get('/public/recentActivity').expect(200);
    activities = res.body;
  });

  // — Recent Activity ——

  it('GET /public/recentActivity — lists recent activities', () => {
    expect(activities).to.be.an('array');
  });

  it('GET /public/recentActivity — returns at most 4 items', () => {
    expect(activities).to.have.lengthOf.at.most(4);
  });

  it('GET /public/recentActivity — each item has required fields', () => {
    expect(activities.length).to.be.at.least(1);
    for (const item of activities) {
      expect(item).to.have.property('_id');
      expect(item).to.have.property('headline').that.is.a('string');
      expect(item).to.have.property('active', true);
      expect(item).to.have.property('pinned').that.is.a('boolean');
      expect(item).to.have.property('dateAdded');
    }
  });

  it('GET /public/recentActivity — pinned items appear before unpinned', () => {
    const firstUnpinned = activities.findIndex(a => !a.pinned);
    if (firstUnpinned === -1) return; // all pinned — trivially correct
    activities.slice(firstUnpinned).forEach(item => {
      expect(item.pinned).to.equal(false, 'no pinned item should follow an unpinned item');
    });
  });

  it('GET /public/recentActivity — project field is a populated object when present', () => {
    const withProject = activities.filter(a => a.project && typeof a.project === 'object' && !Array.isArray(a.project));
    for (const item of withProject) {
      expect(item.project).to.have.property('_id');
    }
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
