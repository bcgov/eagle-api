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
});
