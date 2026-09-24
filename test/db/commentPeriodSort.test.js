/**
 * Sorting admin's comment period list (GET /api/commentperiod) against a real MongoDB.
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
const commentPeriodController = require('../../api/controllers/commentperiod');

const { TEST_URI, id, STAFF_ONLY, PUBLIC_READ, PUBLIC_PROJECT, PARENT_FIXTURES, capture, idsIn } = require('./parentReadFixtures');

const PUBLISHED_1 = id('58990017d334ee001d60fc01');
const UNPUBLISHED_1 = id('58990017d334ee001d60fc02');
const PUBLISHED_2 = id('58990017d334ee001d60fc03');
const NEVER_SET = id('58990017d334ee001d60fc04');
const UNPUBLISHED_2 = id('58990017d334ee001d60fc05');

const period = (_id, isPublished) => ({
  _id,
  _schemaName: 'CommentPeriod',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: PUBLIC_PROJECT,
  isPublished,
  dateStarted: new Date('2026-01-01'),
  dateCompleted: new Date('2026-12-31')
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  // Inserted out of every order under test, so an ignored sort cannot pass by insertion order.
  period(PUBLISHED_2, true),
  period(UNPUBLISHED_1, false),
  period(NEVER_SET, null),
  period(PUBLISHED_1, true),
  period(UNPUBLISHED_2, false)
];

const PUBLISHED = new Set([PUBLISHED_1, PUBLISHED_2].map(String));
const UNPUBLISHED = new Set([UNPUBLISHED_1, UNPUBLISHED_2].map(String));
// Mongo orders null before false before true.
const rank = (periodId) => (PUBLISHED.has(periodId) ? 2 : UNPUBLISHED.has(periodId) ? 1 : 0);

// The query admin's comment period table sends (commentperiod.service.ts getAllByProjectId).
const ADMIN_FIELDS = ['project', 'dateStarted', 'dateCompleted', 'isMet', 'metURLAdmin', 'isPublished'];

function listArgs(sortBy, pageNum = 0, pageSize = 10, fields = ADMIN_FIELDS) {
  return {
    swagger: {
      params: {
        commentPeriodId: { value: null },
        project: { value: String(PUBLIC_PROJECT) },
        sortBy: { value: [sortBy] },
        fields: { value: fields },
        pageSize: { value: pageSize },
        pageNum: { value: pageNum },
        count: { value: true },
        auth_payload: { realm_access: { roles: ['staff'] }, preferred_username: 'staff' }
      }
    }
  };
}

async function list(...args) {
  const { res, body } = capture();
  await commentPeriodController.protectedGet(listArgs(...args), res);
  expect(body.code).to.equal(200);
  return idsIn(body.data[0].results);
}

describe('Comment period list sorted by Published (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
    sinon.stub(Utils, 'recordAction').resolves();
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  it('orders unset, then unpublished, then published ascending', async () => {
    expect((await list('+isPublished')).map(rank)).to.deep.equal([0, 1, 1, 2, 2]);
  });

  it('orders published, then unpublished, then unset descending', async () => {
    expect((await list('-isPublished')).map(rank)).to.deep.equal([2, 2, 1, 1, 0]);
  });

  it('shows every period once across pages, in order', async () => {
    const pages = [...await list('-isPublished', 0, 2), ...await list('-isPublished', 1, 2), ...await list('-isPublished', 2, 2)];

    expect(pages.map(rank)).to.deep.equal([2, 2, 1, 1, 0]);
    expect(new Set(pages).size).to.equal(FIXTURES.length - PARENT_FIXTURES.length);
  });

  it('breaks ties by _id when a tie spans a page boundary', async () => {
    // Pages of 2 split both the unpublished and the published tie; insertion order is not _id order.
    const pages = [...await list('+isPublished', 0, 2), ...await list('+isPublished', 1, 2), ...await list('+isPublished', 2, 2)];

    expect(pages).to.deep.equal([NEVER_SET, UNPUBLISHED_1, UNPUBLISHED_2, PUBLISHED_1, PUBLISHED_2].map(String));
  });
});
