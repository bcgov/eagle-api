/**
 * Recent activity visibility against a real MongoDB.
 *
 * An activity's own `read[]` says nothing about its project, so an active row under an unpublished
 * project used to be served to anonymous callers by /api/public/recentActivity and
 * /api/search?dataset=RecentActivity. These specs drive the real controllers so the assertions are
 * about what a caller gets back, not about pipeline shape.
 *
 * Needs a MongoDB the aggregation framework actually runs on, so it is not part of `npm test`.
 * CI runs it in its own step against a service container.
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
const searchController = require('../../api/controllers/search');
const recentActivityController = require('../../api/controllers/recentActivity');

const {
  TEST_URI,
  id,
  STAFF_ONLY,
  PUBLIC_READ,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PRIVATE_NOTIFICATION,
  PUBLIC_ONLY_PROJECT,
  EMPTY_READ_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

// The four newest rows all sit under parents the public cannot read. The public route keeps the top
// four rows, so anything visible comes back only when the gate runs before that cut.
const RA_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d60ea01');
const RA_UNDER_PRIVATE_PROJECT_2 = id('58990017d334ee001d60ea02');
const RA_UNDER_PRIVATE_PROJECT_3 = id('58990017d334ee001d60ea03');
const RA_UNDER_PRIVATE_NOTIFICATION = id('58990017d334ee001d60ea04');
const RA_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d60ea05');
const RA_WITH_NO_PARENT = id('58990017d334ee001d60ea06');
const RA_UNDER_EMPTY_READ_PROJECT = id('58990017d334ee001d60ea07');
const RA_UNDER_PUBLIC_ONLY_PROJECT = id('58990017d334ee001d60ea08');

// Every row below is active and published in its own right; only its parent differs.
const activity = (_id, parent, headline, dateAdded) => ({
  _id,
  _schemaName: 'RecentActivity',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: parent,
  headline,
  type: 'News',
  active: true,
  pinned: false,
  dateAdded: new Date(dateAdded)
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  activity(RA_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, 'under unpublished project', '2026-06-04'),
  activity(RA_UNDER_PRIVATE_PROJECT_2, PRIVATE_PROJECT, 'under unpublished project again', '2026-06-03'),
  activity(RA_UNDER_PRIVATE_PROJECT_3, PRIVATE_PROJECT, 'under unpublished project once more', '2026-06-02'),
  activity(RA_UNDER_PRIVATE_NOTIFICATION, PRIVATE_NOTIFICATION, 'under unpublished notification', '2026-06-01'),
  activity(RA_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, 'under public project', '2026-05-01'),
  activity(RA_WITH_NO_PARENT, null, 'orphan', '2026-04-01'),
  activity(RA_UNDER_EMPTY_READ_PROJECT, EMPTY_READ_PROJECT, 'under unset read project', '2026-03-01'),
  activity(RA_UNDER_PUBLIC_ONLY_PROJECT, PUBLIC_ONLY_PROJECT, 'under public only project', '2026-02-01')
];

function searchArgs(roles, populate) {
  return {
    swagger: {
      params: {
        _id: { value: null },
        keywords: { value: '' },
        dataset: { value: 'RecentActivity' },
        project: { value: null },
        populate: { value: populate },
        pageNum: { value: 0 },
        pageSize: { value: 100 },
        projectLegislation: { value: '' },
        sortBy: { value: ['-dateAdded'] },
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

function itemArgs(roles, itemId) {
  const args = searchArgs(roles, false);
  args.swagger.params.dataset = { value: 'Item' };
  args.swagger.params._schemaName = { value: 'RecentActivity' };
  args.swagger.params._id = { value: String(itemId) };
  return args;
}

function publicRouteArgs() {
  return { swagger: { params: { auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' } } } };
}

describe('recent activity parent visibility (requires MongoDB)', function () {
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

  describe('GET /api/public/recentActivity', () => {
    it('hides activity whose parent project is unpublished', async () => {
      const { res, body } = capture();
      await recentActivityController.publicGet(publicRouteArgs(), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(RA_UNDER_PRIVATE_PROJECT));
    });

    it('hides activity under an unpublished ProjectNotification', async () => {
      const { res, body } = capture();
      await recentActivityController.publicGet(publicRouteArgs(), res);

      expect(idsIn(body.data)).to.not.include(String(RA_UNDER_PRIVATE_NOTIFICATION));
    });

    it('still fills all four slots, so hidden rows go before the page is cut', async () => {
      const { res, body } = capture();
      await recentActivityController.publicGet(publicRouteArgs(), res);

      expect(idsIn(body.data)).to.deep.equal([
        String(RA_UNDER_PUBLIC_PROJECT),
        String(RA_WITH_NO_PARENT),
        String(RA_UNDER_EMPTY_READ_PROJECT),
        String(RA_UNDER_PUBLIC_ONLY_PROJECT)
      ]);
    });
  });

  describe('GET /api/search?dataset=RecentActivity', () => {
    [true, false].forEach(populate => {
      it(`hides activity under an unpublished project from an anonymous caller (populate=${populate})`, async () => {
        const { res, body } = capture();
        await searchController.publicGet(searchArgs(['public'], populate), res);

        expect(body.code).to.equal(200);
        expect(idsIn(body.data)).to.not.include(String(RA_UNDER_PRIVATE_PROJECT));
        expect(idsIn(body.data)).to.include(String(RA_UNDER_PUBLIC_PROJECT));
      });

      it(`still returns that activity to a staff caller (populate=${populate})`, async () => {
        const { res, body } = capture();
        await searchController.protectedGet(searchArgs(['staff'], populate), res);

        expect(body.code).to.equal(200);
        expect(idsIn(body.data)).to.include(String(RA_UNDER_PRIVATE_PROJECT));
      });
    });

    it('keeps activity whose parent reference resolves to nothing', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(idsIn(body.data)).to.include(String(RA_WITH_NO_PARENT));
    });

    it('treats a parent with an empty read[] as public', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(idsIn(body.data)).to.include(String(RA_UNDER_EMPTY_READ_PROJECT));
    });

    it('returns activity under a public-only project to a staff caller who has no public role', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff'], true), res);

      expect(idsIn(body.data)).to.include(String(RA_UNDER_PUBLIC_ONLY_PROJECT));
    });

    it('leaves a hidden row out of the result total', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(body.data[0].meta[0].searchResultsTotal).to.equal(4);
    });
  });

  describe('GET /api/search?dataset=Item&_schemaName=RecentActivity', () => {
    it('hides a single activity whose parent project is unpublished from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(itemArgs(['public'], RA_UNDER_PRIVATE_PROJECT), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns that activity to a staff caller', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(itemArgs(['staff'], RA_UNDER_PRIVATE_PROJECT), res);

      expect(idsIn(body.data)).to.deep.equal([String(RA_UNDER_PRIVATE_PROJECT)]);
    });

    it('returns activity under a public project to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(itemArgs(['public'], RA_UNDER_PUBLIC_PROJECT), res);

      expect(idsIn(body.data)).to.deep.equal([String(RA_UNDER_PUBLIC_PROJECT)]);
    });
  });
});
