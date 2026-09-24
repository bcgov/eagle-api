/**
 * Update (RecentActivity) status visibility against a real MongoDB.
 *
 * Public readers see an Update only when it is published and its publishDate has passed. Rows the
 * backfill has not reached yet carry no status and still go by `active`.
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
const demiPush = require('../../api/helpers/demiPush');
const searchController = require('../../api/controllers/search');
const recentActivityController = require('../../api/controllers/recentActivity');

const { TEST_URI, id, STAFF_ONLY, PUBLIC_READ, PUBLIC_PROJECT, capture, idsIn } = require('./parentReadFixtures');

const PUBLISHED = id('58990017d334ee001d60eb01');
const SCHEDULED = id('58990017d334ee001d60eb02');
const DRAFT = id('58990017d334ee001d60eb03');
const ARCHIVED = id('58990017d334ee001d60eb04');
const LEGACY_ACTIVE = id('58990017d334ee001d60eb05');
const LEGACY_INACTIVE = id('58990017d334ee001d60eb06');
// Oldest dateAdded but newest publishDate: the feed must lead with it.
const PUBLISHED_LATE = id('58990017d334ee001d60eb07');

const DAY = 24 * 60 * 60 * 1000;

// Stored out of id order, so a sort by id would show.
const IMAGES = [
  { document: id('58990017d334ee001d60eb12'), alt: 'Site plan', caption: 'Phase one', credit: 'EAO' },
  { document: id('58990017d334ee001d60eb11'), alt: 'Access road', caption: null, credit: null }
];

// read[] and active are set as if they were live, so only status and publishDate can hide a row.
const update = (_id, fields, dateAdded) => ({
  _id,
  _schemaName: 'RecentActivity',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: PUBLIC_PROJECT,
  headline: String(_id),
  type: 'News',
  active: true,
  pinned: false,
  dateAdded: new Date(dateAdded),
  notifiedAt: new Date(dateAdded),
  _addedBy: 'staff-author',
  _updatedBy: 'staff-editor',
  ...fields
});

const STAFF_FIELDS = ['notifiedAt', '_addedBy', '_updatedBy'];

// Rows as the response carries them, whichever shape the route returns.
const rowsIn = (payload) => {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.length && rows[0].searchResults ? rows[0].searchResults : rows;
};

const expectNoStaffFields = (payload) => {
  const rows = rowsIn(payload);
  expect(rows).to.not.be.empty;
  rows.forEach(row => STAFF_FIELDS.forEach(field => expect(row, `${row._id} ${field}`).to.not.have.property(field)));
};

const FIXTURES = [
  { _id: PUBLIC_PROJECT, _schemaName: 'Project', read: PUBLIC_READ, currentLegislationYear: 'legislation_2018', legislation_2018: { name: 'P' } },
  update(PUBLISHED, { status: 'published', publishDate: new Date(Date.now() - DAY), images: IMAGES }, '2026-06-01'),
  update(SCHEDULED, { status: 'published', publishDate: new Date(Date.now() + DAY) }, '2026-06-02'),
  update(DRAFT, { status: 'draft', publishDate: new Date(Date.now() - DAY) }, '2026-06-03'),
  update(ARCHIVED, { status: 'archived', publishDate: new Date(Date.now() - DAY) }, '2026-06-04'),
  update(LEGACY_ACTIVE, {}, '2026-05-01'),
  update(LEGACY_INACTIVE, { active: false }, '2026-05-02'),
  update(PUBLISHED_LATE, { status: 'published', publishDate: new Date(Date.now() - 60000) }, '2026-01-01')
];

const PUBLIC_IDS = [String(PUBLISHED_LATE), String(PUBLISHED), String(LEGACY_ACTIVE)];
const HIDDEN_IDS = [String(SCHEDULED), String(DRAFT), String(ARCHIVED), String(LEGACY_INACTIVE)];

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

describe('Update status visibility (requires MongoDB)', function () {
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

  it('GET /api/public/recentActivity serves only published, live Updates and unmigrated active rows', async () => {
    const { res, body } = capture();
    await recentActivityController.publicGet({ swagger: { params: {} } }, res);

    expect(body.code).to.equal(200);
    expect(idsIn(body.data)).to.have.members(PUBLIC_IDS);
  });

  it('GET /api/public/recentActivity leads with the newest publishDate and hides staff fields', async () => {
    const { res, body } = capture();
    await recentActivityController.publicGet({ swagger: { params: {} } }, res);

    expect(idsIn(body.data)).to.deep.equal(PUBLIC_IDS);
    expectNoStaffFields(body.data);
  });

  it('GET /api/public/recentActivity serves images in the order stored', async () => {
    const { res, body } = capture();
    await recentActivityController.publicGet({ swagger: { params: {} } }, res);

    const row = body.data.find(item => String(item._id) === String(PUBLISHED));
    expect(row.images.map(image => ({ ...image, document: String(image.document) })))
      .to.deep.equal(IMAGES.map(image => ({ ...image, document: String(image.document) })));
  });

  [true, false].forEach(populate => {
    it(`public search hides staff fields (populate=${populate})`, async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], populate), res);

      expectNoStaffFields(body.data);
    });

    it(`staff search leaves archived Updates out unless it filters on status (populate=${populate})`, async () => {
      const plain = capture();
      await searchController.protectedGet(searchArgs(['staff'], populate), plain.res);
      expect(idsIn(plain.body.data)).to.not.include(String(ARCHIVED));

      const args = searchArgs(['staff'], populate);
      args.swagger.params.and = { value: 'status=archived' };
      const filtered = capture();
      await searchController.protectedGet(args, filtered.res);
      expect(idsIn(filtered.body.data)).to.deep.equal([String(ARCHIVED)]);
    });

    it(`staff search filtering on another field still leaves archived Updates out (populate=${populate})`, async () => {
      const args = searchArgs(['staff'], populate);
      args.swagger.params.and = { value: 'type=News' };
      const { res, body } = capture();
      await searchController.protectedGet(args, res);

      expect(idsIn(body.data)).to.include(String(DRAFT)).and.not.include(String(ARCHIVED));
    });

    it(`public search serves only published, live Updates (populate=${populate})`, async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public'], populate), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.have.members(PUBLIC_IDS);
    });
  });

  it('staff search still sees drafts, scheduled and archived Updates', async () => {
    const { res, body } = capture();
    await searchController.protectedGet(searchArgs(['staff'], true), res);

    expect(idsIn(body.data)).to.include.members([...PUBLIC_IDS, String(SCHEDULED), String(DRAFT)]);
    // Staff keep what the public may not see.
    expect(rowsIn(body.data)[0]).to.have.property('_addedBy');
  });

  HIDDEN_IDS.slice(0, 3).forEach(hidden => {
    it(`a single fetch through dataset=Item hides ${hidden} from the public`, async () => {
      const { res, body } = capture();
      await searchController.publicGet(itemArgs(['public'], hidden), res);

      expect(idsIn(body.data)).to.be.empty;
    });
  });

  it('a single fetch through dataset=Item serves a published Update', async () => {
    const { res, body } = capture();
    await searchController.publicGet(itemArgs(['public'], PUBLISHED), res);

    expect(idsIn(body.data)).to.deep.equal([String(PUBLISHED)]);
    expectNoStaffFields(body.data);
  });

  it('a single fetch through dataset=Item still opens an archived Update for staff', async () => {
    const { res, body } = capture();
    await searchController.protectedGet(itemArgs(['staff'], ARCHIVED), res);

    expect(idsIn(body.data)).to.deep.equal([String(ARCHIVED)]);
  });

  it('PUT stores the featured image caption and credit', async () => {
    sinon.stub(demiPush, 'recentActivity').resolves(true);
    const featuredImage = { document: id('58990017d334ee001d60eb13'), alt: 'Site plan', caption: 'Phase one', credit: 'EAO' };
    const { res, body } = capture();
    await recentActivityController.protectedPut({
      swagger: {
        params: {
          recentActivityId: { value: String(DRAFT) },
          RecentActivityObject: { value: { status: 'draft', featuredImage } },
          auth_payload: { preferred_username: 'staff' }
        }
      }
    }, res);

    expect(body.code).to.equal(200);
    const stored = await mongoose.connection.collection('epic').findOne({ _id: DRAFT });
    expect(stored.featuredImage).to.include({ caption: 'Phase one', credit: 'EAO' });
  });

  it('DELETE archives the Update and takes it off the public feed', async () => {
    sinon.stub(demiPush, 'recentActivity').resolves(true);
    const { res, body } = capture();
    await recentActivityController.protectedDelete({
      swagger: {
        operation: { 'x-security-scopes': ['sysadmin'] },
        params: { recentActivityId: { value: String(PUBLISHED) }, auth_payload: { preferred_username: 'staff' } }
      }
    }, res);

    expect(body.code).to.equal(200);
    const stored = await mongoose.connection.collection('epic').findOne({ _id: PUBLISHED });
    expect(stored).to.include({ status: 'archived', active: false });
    expect(stored.read).to.not.include('public');

    const feed = capture();
    await recentActivityController.publicGet({ swagger: { params: {} } }, feed.res);
    expect(idsIn(feed.body.data)).to.not.include(String(PUBLISHED));
  });
});
