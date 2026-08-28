'use strict';

const { expect } = require('chai');
const { authGet, hasToken, resolveCommentPeriodId, resolveCommentId } = require('./helpers');

describe('PROTECTED /api/comment & /api/commentperiod (requires token)', () => {
  let commentPeriodId;
  let commentId;

  before(async function () {
    if (!hasToken()) return this.skip();
    commentPeriodId = await resolveCommentPeriodId();
    commentId = await resolveCommentId();
  });

  // — Comment Periods ——

  it('GET /commentperiod — lists all comment periods (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/commentperiod').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
  });

  it('GET /commentperiod without token — accessible as public', async () => {
    const req = require('supertest')(require('./helpers').API).get('/commentperiod').query({ pageNum: 0, pageSize: 1 });
    await req.expect(200);
  });

  it('GET /commentperiod/:commentPeriodId — returns specific comment period', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/commentperiod/${commentPeriodId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', commentPeriodId);
  });

  it('GET /commentperiod/:commentPeriodId/summary — returns period summary', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/commentperiod/${commentPeriodId}/summary`).expect(200);
    // Returns an object with comment counts by status: { Pending, Deferred, Published, Rejected }
    expect(res.body).to.be.an('object');
    expect(res.body).to.have.property('Pending').that.is.a('number');
  });

  // — Comments ——

  it('GET /comment?period=:id — lists comments for period (staff/sysadmin)', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet('/comment').query({ period: commentPeriodId, pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /comment without token — refused', async () => {
    const req = require('supertest')(require('./helpers').API).get('/comment').query({ period: '000000000000000000000000', pageNum: 0, pageSize: 1 });
    await req.expect(403);
  });

  it('GET /comment/:commentId — returns specific comment (if any exist)', async function () {
    if (!hasToken() || !commentId) return this.skip();
    const res = await authGet(`/comment/${commentId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', commentId);
  });

  it('GET /comment/export/:periodId?format=csv — exports comment CSV', async function () {
    if (!hasToken()) return this.skip();
    const res = await authGet(`/comment/export/${commentPeriodId}`).query({ format: 'csv' });
    // May be empty if period has no comments, but must not 500
    expect(res.status).to.be.oneOf([200, 204]);
  });
});
