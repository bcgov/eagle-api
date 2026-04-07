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

  it('GET /public/comment — comment has required fields when present', async function () {
    if (!commentId) return this.skip();
    const res = await get(`/public/comment/${commentId}`).expect(200);
    const comment = res.body[0];
    expect(comment).to.have.property('_id', commentId);
    expect(comment).to.have.property('period');
    expect(comment).to.have.property('dateAdded');
  });

  it('GET /public/comment — page 0 and page 1 return non-overlapping results', async () => {
    const [res0, res1] = await Promise.all([
      get('/public/comment').query({ period: commentPeriodId, pageNum: 0, pageSize: 5 }).expect(200),
      get('/public/comment').query({ period: commentPeriodId, pageNum: 1, pageSize: 5 }).expect(200)
    ]);
    const ids0 = res0.body.map(c => c._id);
    const ids1 = res1.body.map(c => c._id);
    if (!ids0.length || !ids1.length) return; // fewer than 6 comments — cannot verify windowing
    const overlap = ids0.filter(id => ids1.includes(id));
    expect(overlap).to.have.lengthOf(0, 'page 0 and page 1 should not share comments');
  });
});
