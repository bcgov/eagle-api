/**
 * Single-record visibility through the Item dataset, against a real MongoDB.
 *
 * GET /api/search?dataset=Item&_schemaName=X&_id=Y matches on `_id` and redacts on the record's
 * own `read[]`, so it bypassed the parent gates the per-dataset pipelines apply. These specs drive
 * the real controller, so the assertions are about what a caller gets back.
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
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

const DOC_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d609a01');
const DOC_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d609a02');
const DOC_UNDER_PRIVATE_NOTIFICATION = id('58990017d334ee001d609a03');
const DOC_UNDER_PUBLIC_ONLY_PROJECT = id('58990017d334ee001d609a04');

const CP_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d609b01');
const CP_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d609b02');
// Readable only by staff, but its project is public: the one-level gate has to catch this one.
const STAFF_CP_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d609b03');

const COMMENT_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d609c01');
const COMMENT_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d609c02');
const COMMENT_UNDER_STAFF_PERIOD = id('58990017d334ee001d609c03');
const COMMENT_WITH_NO_PERIOD = id('58990017d334ee001d609c04');
const COMMENT_UNDER_DELETED_PERIOD = id('58990017d334ee001d609c06');
const DELETED_PERIOD = id('58990017d334ee001d609bff');

// Published, under a public period and project, carrying every field a public caller must not see.
const COMMENT_WITH_STAFF_FIELDS = id('58990017d334ee001d609c05');
const COMMENT_HIDDEN_FIELDS = {
  author: 'Jane Private',
  isAnonymous: true,
  eaoNotes: 'staff note',
  eaoStatus: 'Published',
  proponentNotes: 'proponent note',
  rejectedNotes: 'rejected note',
  rejectedReason: 'rejected reason',
  demiPushPending: true,
  demiPushFailedAt: new Date('2026-10-01T00:00:00Z'),
  demiPushError: 'push error',
  _addedBy: 'staff-user',
  _updatedBy: 'staff-user',
  _deletedBy: 'staff-user'
};

// Records eagle-admin opens through dataset=Item, staff-only so only a staff caller reads them.
const ADMIN_USER = id('58990017d334ee001d609e01');
const ADMIN_ORGANIZATION = id('58990017d334ee001d609e02');
const ADMIN_UPDATE = id('58990017d334ee001d609e03');

const VC_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d609d01');
const VC_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d609d02');

// Every record below is published in its own right; only its parent differs.
const child = (_id, schemaName, parentField, parentId, read = PUBLIC_READ) => ({
  _id,
  _schemaName: schemaName,
  read,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  [parentField]: parentId
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  child(DOC_UNDER_PUBLIC_PROJECT, 'Document', 'project', PUBLIC_PROJECT),
  child(DOC_UNDER_PRIVATE_PROJECT, 'Document', 'project', PRIVATE_PROJECT),
  child(DOC_UNDER_PRIVATE_NOTIFICATION, 'Document', 'project', PRIVATE_NOTIFICATION),
  child(DOC_UNDER_PUBLIC_ONLY_PROJECT, 'Document', 'project', PUBLIC_ONLY_PROJECT),
  child(CP_UNDER_PUBLIC_PROJECT, 'CommentPeriod', 'project', PUBLIC_PROJECT),
  child(CP_UNDER_PRIVATE_PROJECT, 'CommentPeriod', 'project', PRIVATE_PROJECT),
  child(STAFF_CP_UNDER_PUBLIC_PROJECT, 'CommentPeriod', 'project', PUBLIC_PROJECT, STAFF_ONLY),
  child(COMMENT_UNDER_PUBLIC_PROJECT, 'Comment', 'period', CP_UNDER_PUBLIC_PROJECT),
  child(COMMENT_UNDER_PRIVATE_PROJECT, 'Comment', 'period', CP_UNDER_PRIVATE_PROJECT),
  child(COMMENT_UNDER_STAFF_PERIOD, 'Comment', 'period', STAFF_CP_UNDER_PUBLIC_PROJECT),
  child(COMMENT_WITH_NO_PERIOD, 'Comment', 'period', null),
  child(COMMENT_UNDER_DELETED_PERIOD, 'Comment', 'period', DELETED_PERIOD),
  { ...child(COMMENT_WITH_STAFF_FIELDS, 'Comment', 'period', CP_UNDER_PUBLIC_PROJECT), comment: 'Hello', ...COMMENT_HIDDEN_FIELDS },
  child(VC_UNDER_PUBLIC_PROJECT, 'Vc', 'project', PUBLIC_PROJECT),
  child(VC_UNDER_PRIVATE_PROJECT, 'Vc', 'project', PRIVATE_PROJECT),
  { _id: ADMIN_USER, _schemaName: 'User', read: STAFF_ONLY, firstName: 'Ada' },
  { _id: ADMIN_ORGANIZATION, _schemaName: 'Organization', read: STAFF_ONLY, name: 'Org' },
  { ...child(ADMIN_UPDATE, 'RecentActivity', 'project', PUBLIC_PROJECT, STAFF_ONLY), status: 'draft' }
];

function itemArgs(roles, schemaName, itemId) {
  return {
    swagger: {
      params: {
        _id: { value: String(itemId) },
        _schemaName: { value: schemaName },
        dataset: { value: 'Item' },
        keywords: { value: '' },
        project: { value: null },
        populate: { value: false },
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

async function anonymousGet(schemaName, itemId) {
  const { res, body } = capture();
  await searchController.publicGet(itemArgs(['public'], schemaName, itemId), res);
  return body;
}

async function staffGet(schemaName, itemId) {
  const { res, body } = capture();
  await searchController.protectedGet(itemArgs(['staff'], schemaName, itemId), res);
  return body;
}

describe('item parent visibility (requires MongoDB)', function () {
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

  describe('_schemaName=Document', () => {
    it('hides a published document whose parent project is unpublished from an anonymous caller', async () => {
      const body = await anonymousGet('Document', DOC_UNDER_PRIVATE_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('hides a published document under an unpublished ProjectNotification from an anonymous caller', async () => {
      const body = await anonymousGet('Document', DOC_UNDER_PRIVATE_NOTIFICATION);

      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns the document under an unpublished project to a staff caller', async () => {
      const body = await staffGet('Document', DOC_UNDER_PRIVATE_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.deep.equal([String(DOC_UNDER_PRIVATE_PROJECT)]);
    });

    it('returns a document under a public project to an anonymous caller', async () => {
      const body = await anonymousGet('Document', DOC_UNDER_PUBLIC_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(DOC_UNDER_PUBLIC_PROJECT)]);
    });

    it('returns a document under a public-only project to a staff caller who has no public role', async () => {
      const body = await staffGet('Document', DOC_UNDER_PUBLIC_ONLY_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(DOC_UNDER_PUBLIC_ONLY_PROJECT)]);
    });
  });

  describe('_schemaName=CommentPeriod', () => {
    it('hides a published comment period whose project is unpublished from an anonymous caller', async () => {
      const body = await anonymousGet('CommentPeriod', CP_UNDER_PRIVATE_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns that comment period to a staff caller', async () => {
      const body = await staffGet('CommentPeriod', CP_UNDER_PRIVATE_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(CP_UNDER_PRIVATE_PROJECT)]);
    });

    it('returns a comment period under a public project to an anonymous caller', async () => {
      const body = await anonymousGet('CommentPeriod', CP_UNDER_PUBLIC_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(CP_UNDER_PUBLIC_PROJECT)]);
    });
  });

  describe('_schemaName=Comment', () => {
    it('hides a comment whose period sits under an unpublished project from an anonymous caller', async () => {
      const body = await anonymousGet('Comment', COMMENT_UNDER_PRIVATE_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('hides a comment whose period is staff-only from an anonymous caller', async () => {
      const body = await anonymousGet('Comment', COMMENT_UNDER_STAFF_PERIOD);

      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns both of those comments to a staff caller', async () => {
      const underPrivateProject = await staffGet('Comment', COMMENT_UNDER_PRIVATE_PROJECT);
      const underStaffPeriod = await staffGet('Comment', COMMENT_UNDER_STAFF_PERIOD);

      expect(idsIn(underPrivateProject.data)).to.deep.equal([String(COMMENT_UNDER_PRIVATE_PROJECT)]);
      expect(idsIn(underStaffPeriod.data)).to.deep.equal([String(COMMENT_UNDER_STAFF_PERIOD)]);
    });

    it('returns a comment under a public period and a public project to an anonymous caller', async () => {
      const body = await anonymousGet('Comment', COMMENT_UNDER_PUBLIC_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(COMMENT_UNDER_PUBLIC_PROJECT)]);
    });

    [['no period', COMMENT_WITH_NO_PERIOD], ['a deleted period', COMMENT_UNDER_DELETED_PERIOD]].forEach(([label, commentId]) => {
      it(`hides a comment with ${label} from an anonymous caller, and still returns it to staff`, async () => {
        const anonymous = await anonymousGet('Comment', commentId);
        const staff = await staffGet('Comment', commentId);

        expect(idsIn(anonymous.data)).to.be.empty;
        expect(idsIn(staff.data)).to.deep.equal([String(commentId)]);
      });
    });
  });

  describe('_schemaName=Vc', () => {
    it('hides a public valued component whose project is unpublished from an anonymous caller', async () => {
      const body = await anonymousGet('Vc', VC_UNDER_PRIVATE_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('still returns that valued component to a staff caller', async () => {
      const body = await staffGet('Vc', VC_UNDER_PRIVATE_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(VC_UNDER_PRIVATE_PROJECT)]);
    });

    it('returns a valued component under a public project to an anonymous caller', async () => {
      const body = await anonymousGet('Vc', VC_UNDER_PUBLIC_PROJECT);

      expect(idsIn(body.data)).to.deep.equal([String(VC_UNDER_PUBLIC_PROJECT)]);
    });
  });

  // Every model shares the epic collection, so the requested name must match the stored one.
  describe('a _schemaName that is not the stored record\'s', () => {
    ['List', 'Organization', 'Topic', 'Document'].forEach(schemaName => {
      it(`returns nothing when a comment is asked for as ${schemaName}`, async () => {
        const body = await anonymousGet(schemaName, COMMENT_WITH_STAFF_FIELDS);

        expect(body.code).to.equal(200);
        expect(body.data).to.deep.equal([]);
      });
    });

    it('returns nothing for a comment under an unpublished project asked for as List', async () => {
      const body = await anonymousGet('List', COMMENT_UNDER_PRIVATE_PROJECT);

      expect(body.data).to.deep.equal([]);
    });

    it('returns nothing when a project is asked for as List', async () => {
      const body = await anonymousGet('List', PUBLIC_PROJECT);

      expect(body.data).to.deep.equal([]);
    });

    it('still returns the comment asked for under its own name, without the hidden fields', async () => {
      const body = await anonymousGet('Comment', COMMENT_WITH_STAFF_FIELDS);

      expect(idsIn(body.data)).to.deep.equal([String(COMMENT_WITH_STAFF_FIELDS)]);
      expect(body.data[0].comment).to.equal('Hello');
      expect(body.data[0]).to.not.have.any.keys('write', 'delete', ...Object.keys(COMMENT_HIDDEN_FIELDS).filter(f => f !== 'isAnonymous'));
    });
  });

  describe('staff reads of the schemas eagle-admin opens by id', () => {
    [
      ['User', ADMIN_USER],
      ['Organization', ADMIN_ORGANIZATION],
      ['RecentActivity', ADMIN_UPDATE],
      ['ProjectNotification', PRIVATE_NOTIFICATION]
    ].forEach(([schemaName, itemId]) => {
      it(`returns a ${schemaName} asked for under its own name`, async () => {
        const body = await staffGet(schemaName, itemId);

        expect(body.code).to.equal(200);
        expect(idsIn(body.data)).to.deep.equal([String(itemId)]);
      });
    });
  });

  // A project has no parent, so the gate must not touch it.
  describe('_schemaName=Project', () => {
    it('returns a published project to an anonymous caller', async () => {
      const body = await anonymousGet('Project', PUBLIC_PROJECT);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.deep.equal([String(PUBLIC_PROJECT)]);
    });

    it('hides an unpublished project from an anonymous caller on its own read[]', async () => {
      const body = await anonymousGet('Project', PRIVATE_PROJECT);

      expect(idsIn(body.data)).to.be.empty;
    });
  });
});
