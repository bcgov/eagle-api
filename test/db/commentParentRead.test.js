/**
 * Public comment routes against a real MongoDB.
 *
 * A comment keeps its own Published read[] when staff unpublish its comment period or project, so
 * /api/public/comment must gate on the period the way dataset=Item does.
 *
 * Needs a MongoDB the aggregation framework actually runs on, so it is not part of `npm test`.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const commentController = require('../../api/controllers/comment');

const {
  TEST_URI,
  id,
  STAFF_ONLY,
  PUBLIC_READ,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PARENT_FIXTURES
} = require('./parentReadFixtures');

const CP_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d60ab01');
const CP_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d60ab02');
const STAFF_CP_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d60ab03');
const AUTHORS_CP = id('58990017d334ee001d60ab04');
const DELETED_PERIOD = id('58990017d334ee001d60abff');

const COMMENT_UNDER_PUBLIC_PERIOD = id('58990017d334ee001d60ac01');
const COMMENT_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d60ac02');
const COMMENT_UNDER_STAFF_PERIOD = id('58990017d334ee001d60ac03');
const COMMENT_WITH_NO_PERIOD = id('58990017d334ee001d60ac04');
const COMMENT_UNDER_DELETED_PERIOD = id('58990017d334ee001d60ac05');
const ANONYMOUS_COMMENT = id('58990017d334ee001d60ac06');
const NAMED_COMMENT = id('58990017d334ee001d60ac07');

const period = (_id, project, read) => ({ _id, _schemaName: 'CommentPeriod', project, read });
// Every comment is Published in its own right; only its period or project differs.
const comment = (_id, periodId) => ({
  _id,
  _schemaName: 'Comment',
  period: periodId,
  comment: 'Published words',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  period(CP_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, PUBLIC_READ),
  period(CP_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, PUBLIC_READ),
  period(STAFF_CP_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, STAFF_ONLY),
  comment(COMMENT_UNDER_PUBLIC_PERIOD, CP_UNDER_PUBLIC_PROJECT),
  comment(COMMENT_UNDER_PRIVATE_PROJECT, CP_UNDER_PRIVATE_PROJECT),
  comment(COMMENT_UNDER_STAFF_PERIOD, STAFF_CP_UNDER_PUBLIC_PROJECT),
  comment(COMMENT_WITH_NO_PERIOD, null),
  comment(COMMENT_UNDER_DELETED_PERIOD, DELETED_PERIOD),
  period(AUTHORS_CP, PUBLIC_PROJECT, PUBLIC_READ),
  { ...comment(ANONYMOUS_COMMENT, AUTHORS_CP), author: 'Anon Person', isAnonymous: true },
  { ...comment(NAMED_COMMENT, AUTHORS_CP), author: 'Named Person', isAnonymous: false }
];

function capture() {
  const body = { headers: {} };
  const res = {
    status(code) { body.code = code; return this; },
    json(data) { body.data = data; return this; },
    send(data) { body.data = data; return this; },
    setHeader(name, value) { body.headers[name] = value; }
  };
  return { res, body };
}

const periodArgs = (periodId, fields = ['comment']) => ({
  swagger: {
    params: {
      period: { value: periodId ? String(periodId) : undefined },
      fields: { value: fields },
      sortBy: { value: [] },
      pageSize: { value: 100 },
      pageNum: { value: 0 },
      count: { value: true }
    },
    operation: { 'x-security-scopes': ['public'] }
  }
});

const byIdArgs = (commentId, fields = ['comment']) => ({
  swagger: { params: { commentId: { value: String(commentId) }, fields: { value: fields } } }
});

async function call(handler, args) {
  const { res, body } = capture();
  await handler(args, res);
  return body;
}

const ids = rows => (rows || []).map(row => String(row._id));

describe('public comment parent visibility (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
  });

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(() => {
    // recordAction writes an audit row; irrelevant here and it would pollute the collection.
    sinon.stub(Utils, 'recordAction').resolves();
  });

  afterEach(() => sinon.restore());

  [
    ['an unpublished project', CP_UNDER_PRIVATE_PROJECT, COMMENT_UNDER_PRIVATE_PROJECT],
    ['an unpublished period', STAFF_CP_UNDER_PUBLIC_PROJECT, COMMENT_UNDER_STAFF_PERIOD],
    ['a deleted period', DELETED_PERIOD, COMMENT_UNDER_DELETED_PERIOD]
  ].forEach(([label, periodId, commentId]) => {
    it(`lists no comments for a period under ${label}`, async () => {
      const body = await call(commentController.publicGet, periodArgs(periodId));

      expect(body.code).to.equal(200);
      expect(body.headers['x-total-count']).to.equal(0);
      expect(body.data).to.deep.equal([]);
    });

    it(`counts no comments for a period under ${label}`, async () => {
      const body = await call(commentController.publicHead, periodArgs(periodId));

      expect(body.headers['x-total-count']).to.equal(0);
    });

    it(`returns nothing for a comment by id under ${label}`, async () => {
      const body = await call(commentController.publicGet, byIdArgs(commentId));

      expect(body.code).to.equal(200);
      expect(body.data).to.deep.equal([]);
    });
  });

  it('still lists, counts and returns a comment under a public period and project', async () => {
    const list = await call(commentController.publicGet, periodArgs(CP_UNDER_PUBLIC_PROJECT));
    const head = await call(commentController.publicHead, periodArgs(CP_UNDER_PUBLIC_PROJECT));
    const one = await call(commentController.publicGet, byIdArgs(COMMENT_UNDER_PUBLIC_PERIOD));

    expect(ids(list.data)).to.deep.equal([String(COMMENT_UNDER_PUBLIC_PERIOD)]);
    expect(head.headers['x-total-count']).to.equal(1);
    expect(ids(one.data)).to.deep.equal([String(COMMENT_UNDER_PUBLIC_PERIOD)]);
  });

  it('returns nothing for a comment by id that has no period', async () => {
    const body = await call(commentController.publicGet, byIdArgs(COMMENT_WITH_NO_PERIOD));

    expect(body.data).to.deep.equal([]);
  });

  it('lists and counts, across all periods, only comments under a period the public can read', async () => {
    const list = await call(commentController.publicGet, periodArgs(null));
    const head = await call(commentController.publicHead, periodArgs(null));

    expect(ids(list.data)).to.have.members([String(COMMENT_UNDER_PUBLIC_PERIOD), String(ANONYMOUS_COMMENT), String(NAMED_COMMENT)]);
    expect(head.headers['x-total-count']).to.equal(3);
  });

  it('shows the author only where the commenter chose to be named, in a list and by id', async () => {
    const list = await call(commentController.publicGet, periodArgs(AUTHORS_CP, ['author', 'comment']));
    const anonymous = await call(commentController.publicGet, byIdArgs(ANONYMOUS_COMMENT, ['author']));
    const named = await call(commentController.publicGet, byIdArgs(NAMED_COMMENT, ['author']));

    const authors = Object.fromEntries(list.data.map(row => [String(row._id), row.author]));
    expect(authors).to.deep.equal({ [String(ANONYMOUS_COMMENT)]: undefined, [String(NAMED_COMMENT)]: 'Named Person' });
    expect(anonymous.data[0]).to.not.have.property('author');
    expect(named.data[0].author).to.equal('Named Person');
  });
});
