'use strict';

const { expect } = require('chai');
const { get, expectSearchEnvelope } = require('./helpers');

describe('PUBLIC /api/public/search', () => {
  it('GET /public/search?dataset=Project — returns projects', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].meta[0].searchResultsTotal).to.be.at.least(1);
    expect(res.body[0].searchResults.length).to.be.at.least(1);
  });

  it('GET /public/search?dataset=Document — returns documents', async () => {
    const res = await get('/public/search').query({ dataset: 'Document', pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].meta[0].searchResultsTotal).to.be.at.least(1);
  });

  it('GET /public/search?dataset=RecentActivity — returns recent activities', async () => {
    const res = await get('/public/search').query({ dataset: 'RecentActivity', pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].meta[0].searchResultsTotal).to.be.at.least(1);
  });

  it('GET /public/search?dataset=CommentPeriod — returns comment periods', async () => {
    const res = await get('/public/search').query({ dataset: 'CommentPeriod', pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].meta[0].searchResultsTotal).to.be.at.least(1);
  });

  it('GET /public/search?keywords=mine — returns keyword results', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', keywords: 'mine', pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].meta[0].searchResultsTotal).to.be.at.least(1);
  });

  it('GET /public/search?fuzzy=true — fuzzy search works', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', keywords: 'mine', fuzzy: true, pageNum: 0, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
  });

  it('GET /public/search — empty keyword search returns all', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 1 }).expect(200);
    expectSearchEnvelope(res);
  });

  it('GET /public/search?sortBy=+name — sorting works', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 5, sortBy: '+name' }).expect(200);
    expectSearchEnvelope(res);
  });

  it('GET /public/search — pagination (pageNum=1) works', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', pageNum: 1, pageSize: 5 }).expect(200);
    expectSearchEnvelope(res);
  });

  it('GET /public/search — pageSize is respected', async () => {
    const res = await get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 2 }).expect(200);
    expectSearchEnvelope(res);
    expect(res.body[0].searchResults.length).to.be.at.most(2);
  });

  it('GET /public/search — page 0 and page 1 return non-overlapping results', async () => {
    const [res0, res1] = await Promise.all([
      get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 3 }).expect(200),
      get('/public/search').query({ dataset: 'Project', pageNum: 1, pageSize: 3 }).expect(200)
    ]);
    const ids0 = res0.body[0].searchResults.map(r => r._id);
    const ids1 = res1.body[0].searchResults.map(r => r._id);
    if (!ids1.length) return; // fewer than 4 total results — windowing cannot be verified
    const overlap = ids0.filter(id => ids1.includes(id));
    expect(overlap).to.have.lengthOf(0, 'page 0 and page 1 should not share results');
  });

  it('GET /public/search — searchResultsTotal is consistent across pages', async () => {
    const [res0, res1] = await Promise.all([
      get('/public/search').query({ dataset: 'Project', pageNum: 0, pageSize: 2 }).expect(200),
      get('/public/search').query({ dataset: 'Project', pageNum: 1, pageSize: 2 }).expect(200)
    ]);
    const total0 = res0.body[0].meta[0].searchResultsTotal;
    const total1 = res1.body[0].meta[0].searchResultsTotal;
    expect(total0).to.equal(total1, 'searchResultsTotal must be the same regardless of page');
  });
});
