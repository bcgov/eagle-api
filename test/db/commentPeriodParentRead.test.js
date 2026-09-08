/**
 * Comment period visibility against a real MongoDB.
 *
 * A comment period's own `read[]` says nothing about its parent, so a published period under an
 * unpublished project used to be served to anonymous callers by /api/search?dataset=CommentPeriod,
 * /api/public/commentperiod and /api/commentperiod. These specs drive the real controllers so the
 * assertions are about what a caller gets back, not about pipeline shape.
 *
 * Needs a MongoDB the aggregation framework actually runs on, so it is not part of `npm test`.
 * CI runs it in its own step against a service container.
 *
 *   npm run db:up
 *   npm run test:db
 *
 * `db:up` publishes docker-compose.yml's MongoDB on 27017, which is what this defaults to.
 * Point it elsewhere with MONGODB_TEST_URI.
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const searchController = require('../../api/controllers/search');
const commentPeriodController = require('../../api/controllers/commentperiod');

const {
  TEST_URI,
  id,
  STAFF_ONLY,
  PUBLIC_READ,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PUBLIC_NOTIFICATION,
  PRIVATE_NOTIFICATION,
  PUBLIC_ONLY_PROJECT,
  EMPTY_READ_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

// Periods below are all published themselves; only their parent differs.
const CP_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d608c01');
const CP_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d608c02');
const CP_UNDER_PUBLIC_NOTIFICATION = id('6a288e6d6452d0c8edd7c33a');
const CP_UNDER_PRIVATE_NOTIFICATION = id('6a288e6d6452d0c8edd7c44a');
const CP_WITH_NO_PARENT = id('58990017d334ee001d608c03');
const CP_UNDER_PUBLIC_ONLY_PROJECT = id('58990017d334ee001d608c04');
const CP_UNDER_EMPTY_READ_PROJECT = id('58990017d334ee001d608c05');

const period = (_id, parent, name) => ({
  _id,
  _schemaName: 'CommentPeriod',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: parent,
  instructions: name,
  isPublished: true,
  dateStarted: new Date('2026-01-01'),
  dateCompleted: new Date('2026-12-31')
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  period(CP_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, 'under public project'),
  period(CP_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, 'under unpublished project'),
  period(CP_UNDER_PUBLIC_NOTIFICATION, PUBLIC_NOTIFICATION, 'under public notification'),
  period(CP_UNDER_PRIVATE_NOTIFICATION, PRIVATE_NOTIFICATION, 'under unpublished notification'),
  period(CP_WITH_NO_PARENT, null, 'orphan'),
  period(CP_UNDER_PUBLIC_ONLY_PROJECT, PUBLIC_ONLY_PROJECT, 'under public only project'),
  period(CP_UNDER_EMPTY_READ_PROJECT, EMPTY_READ_PROJECT, 'under unset read project')
];

function searchArgs(roles) {
  return {
    swagger: {
      params: {
        _id: { value: null },
        keywords: { value: '' },
        dataset: { value: 'CommentPeriod' },
        project: { value: null },
        populate: { value: true },
        pageNum: { value: 0 },
        pageSize: { value: 100 },
        projectLegislation: { value: '' },
        sortBy: { value: [] },
        caseSensitive: { value: false },
        and: { value: '' },
        or: { value: '' },
        categorized: { value: null },
        fuzzy: { value: false },
        auth_payload: { realm_access: { roles }, preferred_username: roles.join(',') }
      }
    }
  };
}

function listArgs(roles) {
  return {
    swagger: {
      params: {
        commentPeriodId: { value: null },
        project: { value: null },
        sortBy: { value: null },
        fields: { value: ['instructions', 'project', 'isPublished'] },
        pageSize: { value: 100 },
        pageNum: { value: 0 },
        count: { value: false },
        auth_payload: { realm_access: { roles }, preferred_username: roles.join(',') }
      }
    }
  };
}

describe('comment period parent visibility (requires MongoDB)', function () {
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

  describe('GET /api/search?dataset=CommentPeriod', () => {
    it('hides a published period whose parent project is unpublished from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(CP_UNDER_PRIVATE_PROJECT));
    });

    it('still returns that period to a staff caller', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.include(String(CP_UNDER_PRIVATE_PROJECT));
    });

    it('returns a published period under a public project to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(CP_UNDER_PUBLIC_PROJECT));
    });

    it('returns a period under a public ProjectNotification to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(CP_UNDER_PUBLIC_NOTIFICATION));
    });

    it('hides a period under an unpublished ProjectNotification from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.not.include(String(CP_UNDER_PRIVATE_NOTIFICATION));
    });

    it('keeps a period whose parent reference resolves to nothing', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(CP_WITH_NO_PARENT));
    });

    it('returns a period under a public-only project to a staff caller who has no public role', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.include(String(CP_UNDER_PUBLIC_ONLY_PROJECT));
    });

    it('treats a parent with an empty read[] as public', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(CP_UNDER_EMPTY_READ_PROJECT));
    });
  });

  describe('GET /api/public/commentperiod', () => {
    it('hides a published period whose parent project is unpublished', async () => {
      const { res, body } = capture();
      await commentPeriodController.publicGet(listArgs(['public']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(CP_UNDER_PRIVATE_PROJECT));
    });

    it('returns periods under a public project and a public notification', async () => {
      const { res, body } = capture();
      await commentPeriodController.publicGet(listArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(CP_UNDER_PUBLIC_PROJECT));
      expect(idsIn(body.data)).to.include(String(CP_UNDER_PUBLIC_NOTIFICATION));
    });
  });

  // /commentperiod carries x-anonymous-read, so protectedGet is reachable without a token and
  // swagger-security hands it roles ['public'].
  describe('GET /api/commentperiod', () => {
    it('hides a published period whose parent project is unpublished from an anonymous caller', async () => {
      const { res, body } = capture();
      await commentPeriodController.protectedGet(listArgs(['public']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(CP_UNDER_PRIVATE_PROJECT));
    });

    it('still returns that period to a staff caller', async () => {
      const { res, body } = capture();
      await commentPeriodController.protectedGet(listArgs(['staff']), res);

      expect(idsIn(body.data)).to.include(String(CP_UNDER_PRIVATE_PROJECT));
    });
  });
});
