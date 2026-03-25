'use strict';

const { expect } = require('chai');
const { get, resolveCommentPeriodId, resolveCommentId } = require('./helpers');

describe('PUBLIC /api/public/comment & /api/public/commentperiod', () => {
  let commentPeriodId;
  let commentId;

  before(async () => {
    commentPeriodId = await resolveCommentPeriodId();
    commentId = await resolveCommentId();
  });

  // — Comment Periods ——

  it('GET /public/commentperiod — lists comment periods', async () => {
    const res = await get('/public/commentperiod').query({ pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id');
  });

  it('GET /public/commentperiod/:commentPeriodId — returns a specific comment period', async () => {
    const res = await get(`/public/commentperiod/${commentPeriodId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', commentPeriodId);
  });

  it('GET /public/commentperiod/:commentPeriodId — returns empty array for unknown id', async () => {
    // API returns 200 with empty array rather than 404 for unknown IDs
    const res = await get('/public/commentperiod/000000000000000000000000').expect(200);
    expect(res.body).to.be.an('array').with.lengthOf(0);
  });

  // — Comments ——

  it('GET /public/comment?period=:id — lists comments for a period', async () => {
    const res = await get('/public/comment').query({ period: commentPeriodId, pageNum: 0, pageSize: 5 }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /public/comment?period=:id — supports count parameter', async () => {
    const res = await get('/public/comment').query({ period: commentPeriodId, count: true }).expect(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /public/comment/:commentId — returns a specific comment (if any exist)', async function () {
    if (!commentId) return this.skip();
    const res = await get(`/public/comment/${commentId}`).expect(200);
    expect(res.body).to.be.an('array').with.lengthOf.at.least(1);
    expect(res.body[0]).to.have.property('_id', commentId);
  });
});
