'use strict';

const { expect } = require('chai');
const { get, resolveProjectId } = require('./helpers');

describe('PUBLIC /api/public/project', () => {
  let projId;

  before(async () => {
    projId = await resolveProjectId();
  });

  it('GET /public/project — lists projects', async () => {
    const res = await get('/public/project').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    const project = res.body[0];
    expect(project).to.have.property('_id');
  });

  it('GET /public/project — supports fields filter', async () => {
    const res = await get('/public/project').query({ pageNum: 0, pageSize: 2, fields: '_id name' }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /public/project/:projId — returns a specific project', async () => {
    const res = await get(`/public/project/${projId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    const project = res.body[0];
    expect(project).to.have.property('_id', projId);
  });

  it('GET /public/project/:projId — returns empty array for unknown id', async () => {
    // API returns 200 with empty array rather than 404 for unknown IDs
    const res = await get('/public/project/000000000000000000000000').expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(0);
  });

  it('GET /public/project/:projId/pin — returns pins for a project', async () => {
    const res = await get(`/public/project/${projId}/pin`).query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /Public/project/:projId/FeaturedDocuments — returns featured documents', async () => {
    const res = await get(`/Public/project/${projId}/FeaturedDocuments`).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /public/project — pageSize is respected', async () => {
    const res = await get('/public/project').query({ pageNum: 0, pageSize: 2 }).expect(200);
    expect(res.body.length).to.be.at.most(2);
  });

  it('GET /public/project — page 0 and page 1 return non-overlapping results', async () => {
    const [res0, res1] = await Promise.all([
      get('/public/project').query({ pageNum: 0, pageSize: 3 }).expect(200),
      get('/public/project').query({ pageNum: 1, pageSize: 3 }).expect(200)
    ]);
    const ids0 = res0.body.map(p => p._id);
    const ids1 = res1.body.map(p => p._id);
    if (!ids1.length) return; // fewer than 4 projects — windowing cannot be verified
    const overlap = ids0.filter(id => ids1.includes(id));
    expect(overlap).to.have.lengthOf(0, 'page 0 and page 1 should not share projects');
  });
});
