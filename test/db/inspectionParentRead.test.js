/**
 * Inspection visibility against a real MongoDB.
 *
 * An inspection's own `read[]` says nothing about its project, so an inspection published to the
 * public under an unpublished project used to reach anonymous callers through
 * /api/search?dataset=Inspection and dataset=Item. These specs drive the real controller so the
 * assertions are about what a caller gets back, not about pipeline shape.
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

const INSPECTION_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d60fa01');
const INSPECTION_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d60fa02');
const INSPECTION_UNDER_PRIVATE_NOTIFICATION = id('58990017d334ee001d60fa03');
const INSPECTION_WITH_NO_PARENT = id('58990017d334ee001d60fa04');
const INSPECTION_UNDER_EMPTY_READ_PROJECT = id('58990017d334ee001d60fa05');
const INSPECTION_UNDER_PUBLIC_ONLY_PROJECT = id('58990017d334ee001d60fa06');

// Every inspection below is readable in its own right; only its parent differs.
const inspection = (_id, parent, name) => ({
  _id,
  _schemaName: 'Inspection',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: parent,
  name,
  label: name,
  elements: [],
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-01-02')
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  inspection(INSPECTION_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, 'under public project'),
  inspection(INSPECTION_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, 'under unpublished project'),
  inspection(INSPECTION_UNDER_PRIVATE_NOTIFICATION, PRIVATE_NOTIFICATION, 'under unpublished notification'),
  inspection(INSPECTION_WITH_NO_PARENT, null, 'orphan'),
  inspection(INSPECTION_UNDER_EMPTY_READ_PROJECT, EMPTY_READ_PROJECT, 'under unset read project'),
  inspection(INSPECTION_UNDER_PUBLIC_ONLY_PROJECT, PUBLIC_ONLY_PROJECT, 'under public only project')
];

function searchArgs(roles, populate) {
  return {
    swagger: {
      params: {
        _id: { value: null },
        keywords: { value: '' },
        dataset: { value: 'Inspection' },
        project: { value: null },
        populate: { value: populate },
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

function itemArgs(roles, itemId) {
  const args = searchArgs(roles, false);
  args.swagger.params.dataset = { value: 'Item' };
  args.swagger.params._schemaName = { value: 'Inspection' };
  args.swagger.params._id = { value: String(itemId) };
  return args;
}

describe('inspection parent visibility (requires MongoDB)', function () {
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

  describe('GET /api/search?dataset=Inspection', () => {
    [true, false].forEach(populate => {
      it(`hides an inspection under an unpublished project from an anonymous caller (populate=${populate})`, async () => {
        const { res, body } = capture();
        await searchController.publicGet(searchArgs(['public'], populate), res);

        expect(body.code).to.equal(200);
        expect(idsIn(body.data)).to.not.include(String(INSPECTION_UNDER_PRIVATE_PROJECT));
        expect(idsIn(body.data)).to.include(String(INSPECTION_UNDER_PUBLIC_PROJECT));
      });

      it(`still returns that inspection to a staff caller (populate=${populate})`, async () => {
        const { res, body } = capture();
        await searchController.protectedGet(searchArgs(['staff'], populate), res);

        expect(body.code).to.equal(200);
        expect(idsIn(body.data)).to.include(String(INSPECTION_UNDER_PRIVATE_PROJECT));
      });
    });

    it('hides an inspection under an unpublished ProjectNotification from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(idsIn(body.data)).to.not.include(String(INSPECTION_UNDER_PRIVATE_NOTIFICATION));
    });

    it('keeps an inspection whose parent reference resolves to nothing', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(idsIn(body.data)).to.include(String(INSPECTION_WITH_NO_PARENT));
    });

    it('treats a parent with an empty read[] as public', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], true), res);

      expect(idsIn(body.data)).to.include(String(INSPECTION_UNDER_EMPTY_READ_PROJECT));
    });

    it('returns an inspection under a public-only project to a staff caller who has no public role', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff'], true), res);

      expect(idsIn(body.data)).to.include(String(INSPECTION_UNDER_PUBLIC_ONLY_PROJECT));
    });
  });

  describe('GET /api/search?dataset=Item&_schemaName=Inspection', () => {
    it('hides a single inspection whose parent project is unpublished from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(itemArgs(['public'], INSPECTION_UNDER_PRIVATE_PROJECT), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns that inspection to a staff caller', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(itemArgs(['staff'], INSPECTION_UNDER_PRIVATE_PROJECT), res);

      expect(idsIn(body.data)).to.deep.equal([String(INSPECTION_UNDER_PRIVATE_PROJECT)]);
    });

    it('returns an inspection under a public project to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(itemArgs(['public'], INSPECTION_UNDER_PUBLIC_PROJECT), res);

      expect(idsIn(body.data)).to.deep.equal([String(INSPECTION_UNDER_PUBLIC_PROJECT)]);
    });
  });
});
