/**
 * Images uploaded from the Update form (documentSource 'UPDATE') against a real MongoDB: they go
 * public with the Update that shows them, go private again once no published Update shows them,
 * and stay out of document listings.
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
const documentController = require('../../api/controllers/document');
const recentActivityController = require('../../api/controllers/recentActivity');
const documentPublish = require('../../api/helpers/documentPublish');
const updateImages = require('../../api/helpers/updateImages');
const { exportProjectDocs } = require('../../api/helpers/export-docs-helper');

const { TEST_URI, id, STAFF_ONLY, PUBLIC_READ, PUBLIC_PROJECT, PRIVATE_PROJECT, capture, idsIn } = require('./parentReadFixtures');

const DRAFT_UPDATE = id('58990017d334ee001d60ec01');
const LIVE_UPDATE = id('58990017d334ee001d60ec02');
const OTHER_LIVE_UPDATE = id('58990017d334ee001d60ec03');
const OTHER_ARCHIVED_UPDATE = id('58990017d334ee001d60ec04');
const OTHER_LEGACY_UPDATE = id('58990017d334ee001d60ec05');
const IMAGE_UPDATE = id('58990017d334ee001d60ec06');
const ATTACHING_UPDATE = id('58990017d334ee001d60ec07');
// Saved published while an archive is releasing KEPT.
const LATE_UPDATE = id('58990017d334ee001d60ec08');

// Private uploads on the draft.
const UPLOAD_A = id('58990017d334ee001d60ed01');
const UPLOAD_B = id('58990017d334ee001d60ed02');
// Public uploads on the live Update: only it shows KEPT; the others are also shown elsewhere.
const KEPT = id('58990017d334ee001d60ed03');
const SHARED = id('58990017d334ee001d60ed04');
const SHARED_WITH_LEGACY = id('58990017d334ee001d60ed05');
const SHOWN_BY_ARCHIVED = id('58990017d334ee001d60ed06');
const PROJECT_DOC = id('58990017d334ee001d60ed07');
const UNSOURCED_DOC = id('58990017d334ee001d60ed08');
// Shown as an image by IMAGE_UPDATE and as an attachment by ATTACHING_UPDATE.
const SHOWN_AS_ATTACHMENT = id('58990017d334ee001d60ed09');
// Private upload that belongs to another project.
const FOREIGN_UPLOAD = id('58990017d334ee001d60ed0a');

const document = (_id, documentSource, read, project = PUBLIC_PROJECT) => ({
  _id,
  _schemaName: 'Document',
  documentSource,
  read,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project,
  displayName: String(_id),
  documentFileName: `${_id}.png`,
  eaoStatus: read.includes('public') ? 'Published' : '',
  isPublished: read.includes('public')
});

const image = (doc) => ({ document: doc, alt: `Alt ${doc}`, caption: null, credit: null });

const update = (_id, fields) => ({
  _id,
  _schemaName: 'RecentActivity',
  read: fields.status === 'published' || fields.active ? PUBLIC_READ : STAFF_ONLY,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: PUBLIC_PROJECT,
  headline: String(_id),
  type: 'News',
  active: fields.status === 'published',
  pinned: false,
  dateAdded: new Date('2026-09-01'),
  ...fields
});

const FIXTURES = [
  { _id: PUBLIC_PROJECT, _schemaName: 'Project', read: PUBLIC_READ, currentLegislationYear: 'legislation_2018', legislation_2018: { name: 'P' } },
  document(UPLOAD_A, 'UPDATE', STAFF_ONLY),
  document(UPLOAD_B, 'UPDATE', STAFF_ONLY),
  document(KEPT, 'UPDATE', PUBLIC_READ),
  document(SHARED, 'UPDATE', PUBLIC_READ),
  document(SHARED_WITH_LEGACY, 'UPDATE', PUBLIC_READ),
  document(SHOWN_BY_ARCHIVED, 'UPDATE', PUBLIC_READ),
  document(PROJECT_DOC, 'PROJECT', PUBLIC_READ),
  document(UNSOURCED_DOC, '', PUBLIC_READ),
  document(SHOWN_AS_ATTACHMENT, 'UPDATE', PUBLIC_READ),
  document(FOREIGN_UPLOAD, 'UPDATE', STAFF_ONLY, PRIVATE_PROJECT),
  update(DRAFT_UPDATE, { status: 'draft', featuredImage: { document: UPLOAD_B, alt: 'Cover' }, images: [image(UPLOAD_A)] }),
  update(LIVE_UPDATE, {
    status: 'published', publishDate: new Date('2026-09-02'),
    images: [image(KEPT), image(SHARED), image(SHARED_WITH_LEGACY), image(SHOWN_BY_ARCHIVED)]
  }),
  update(OTHER_LIVE_UPDATE, { status: 'published', publishDate: new Date(Date.now() + 86400000), featuredImage: { document: SHARED, alt: 'x' } }),
  update(OTHER_ARCHIVED_UPDATE, { status: 'archived', images: [image(SHOWN_BY_ARCHIVED)] }),
  // Not reached by the status backfill yet: live by active alone.
  update(OTHER_LEGACY_UPDATE, { status: null, active: true, images: [image(SHARED_WITH_LEGACY)] }),
  update(IMAGE_UPDATE, { status: 'published', publishDate: new Date('2026-09-02'), images: [image(SHOWN_AS_ATTACHMENT)] }),
  update(ATTACHING_UPDATE, { status: 'published', publishDate: new Date('2026-09-02'), attachments: [SHOWN_AS_ATTACHMENT] })
];

const STAFF = { realm_access: { roles: ['sysadmin', 'staff'] }, preferred_username: 'staff-user' };
// What swagger-security hands an unauthenticated caller.
const ANONYMOUS = { realm_access: { roles: ['public'] }, preferred_username: 'public' };

const putArgs = (updateId, fields) => ({
  swagger: {
    params: {
      recentActivityId: { value: String(updateId) },
      RecentActivityObject: { value: fields },
      auth_payload: STAFF
    }
  }
});

const archiveArgs = (updateId) => ({
  swagger: {
    operation: { 'x-security-scopes': ['sysadmin'] },
    params: { recentActivityId: { value: String(updateId) }, auth_payload: STAFF }
  }
});

const searchArgs = ({ and = '', or = '', auth = STAFF } = {}) => ({
  swagger: {
    params: {
      _id: { value: null },
      keywords: { value: '' },
      dataset: { value: 'Document' },
      project: { value: null },
      populate: { value: false },
      pageNum: { value: 0 },
      pageSize: { value: 100 },
      projectLegislation: { value: '' },
      sortBy: { value: [] },
      caseSensitive: { value: false },
      and: { value: and },
      or: { value: or },
      categorized: { value: null },
      fuzzy: { value: false },
      auth_payload: auth
    }
  }
});

const docArgs = ({ docId = null, docIds = null, project = null, auth } = {}) => ({
  swagger: {
    params: {
      docId: { value: docId },
      docIds: { value: docIds },
      project: { value: project },
      fields: { value: ['displayName', 'documentSource'] },
      ...(auth ? { auth_payload: auth } : {})
    }
  }
});

const isPublic = async (docId) => {
  const doc = await mongoose.connection.collection('epic').findOne({ _id: docId });
  return doc.read.includes('public');
};

describe('Update images (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(demiPush, 'document').resolves();
    sinon.stub(demiPush, 'recentActivity').resolves();
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  describe('publishing and unpublishing with the Update', () => {
    it('publishing the Update publishes its private uploads and mirrors them to DEMI', async () => {
      const { res, body } = capture();

      await recentActivityController.protectedPut(putArgs(DRAFT_UPDATE, { status: 'published' }), res);

      expect(body.code).to.equal(200);
      expect(await isPublic(UPLOAD_A)).to.be.true;
      expect(await isPublic(UPLOAD_B)).to.be.true;
      expect(demiPush.document.args.map(([doc]) => String(doc._id))).to.have.members([String(UPLOAD_A), String(UPLOAD_B)]);
    });

    it('archiving unpublishes an upload no other Update shows', async () => {
      const { res, body } = capture();

      await recentActivityController.protectedDelete(archiveArgs(LIVE_UPDATE), res);

      expect(body.code).to.equal(200);
      expect(await isPublic(KEPT)).to.be.false;
    });

    it('moving to draft unpublishes an upload no other Update shows', async () => {
      const { res, body } = capture();

      await recentActivityController.protectedPut(putArgs(LIVE_UPDATE, { status: 'draft' }), res);

      expect(body.code).to.equal(200);
      expect(await isPublic(KEPT)).to.be.false;
    });

    it('keeps an upload public while another published Update (scheduled or not yet backfilled) shows it', async () => {
      const { res } = capture();

      await recentActivityController.protectedDelete(archiveArgs(LIVE_UPDATE), res);

      expect(await isPublic(SHARED)).to.be.true;
      expect(await isPublic(SHARED_WITH_LEGACY)).to.be.true;
    });

    it('an archived Update does not keep an upload public', async () => {
      const { res } = capture();

      await recentActivityController.protectedDelete(archiveArgs(LIVE_UPDATE), res);

      expect(await isPublic(SHOWN_BY_ARCHIVED)).to.be.false;
    });

    it('replacing an image on a live Update publishes the new upload and unpublishes the dropped one', async () => {
      const { res, body } = capture();

      await recentActivityController.protectedPut(putArgs(LIVE_UPDATE, {
        status: 'published', images: [image(UPLOAD_A), image(SHARED), image(SHARED_WITH_LEGACY), image(SHOWN_BY_ARCHIVED)]
      }), res);

      expect(body.code).to.equal(200);
      expect(await isPublic(UPLOAD_A)).to.be.true;
      expect(await isPublic(KEPT)).to.be.false;
      expect(await isPublic(SHARED)).to.be.true;
    });

    it('keeps an upload public while another published Update shows it as an attachment', async () => {
      const { res } = capture();

      await recentActivityController.protectedDelete(archiveArgs(IMAGE_UPDATE), res);

      expect(await isPublic(SHOWN_AS_ATTACHMENT)).to.be.true;
    });

    it('publishes an upload back when an Update saved published shows it while the archive is releasing it', async () => {
      const unPublish = documentPublish.unPublish;
      sinon.stub(documentPublish, 'unPublish').callsFake(async (...args) => {
        await mongoose.connection.collection('epic').updateOne(
          { _id: LATE_UPDATE },
          { $setOnInsert: update(LATE_UPDATE, { status: 'published', images: [image(KEPT)] }) },
          { upsert: true });
        return unPublish(...args);
      });
      const { res } = capture();

      await recentActivityController.protectedDelete(archiveArgs(LIVE_UPDATE), res);

      expect(await isPublic(KEPT)).to.be.true;
      expect(await isPublic(SHOWN_BY_ARCHIVED)).to.be.false;
    });

    it('does not publish an upload of another project that an Update lists', async () => {
      await updateImages.publishFor({
        _id: DRAFT_UPDATE, project: PUBLIC_PROJECT, images: [image(FOREIGN_UPLOAD), image(UPLOAD_A)]
      }, 'staff-user');

      expect(await isPublic(FOREIGN_UPLOAD)).to.be.false;
      expect(await isPublic(UPLOAD_A)).to.be.true;
    });
  });

  describe('document listings leave uploads out', () => {
    it('search?dataset=Document lists project and unsourced documents but no Update uploads', async () => {
      const { res, body } = capture();

      await searchController.protectedGet(searchArgs(), res);

      const ids = idsIn(body.data);
      expect(ids).to.include.members([String(PROJECT_DOC), String(UNSOURCED_DOC)]);
      expect(ids).to.not.include(String(KEPT));
    });

    it('search?dataset=Document still finds uploads when the caller filters on documentSource', async () => {
      const { res, body } = capture();

      await searchController.protectedGet(searchArgs({ and: 'documentSource=UPDATE' }), res);

      expect(idsIn(body.data)).to.include(String(KEPT)).and.not.include(String(PROJECT_DOC));
    });

    it('search?dataset=Document still finds uploads for a signed-in caller filtering with or=documentSource', async () => {
      const { res, body } = capture();

      await searchController.protectedGet(searchArgs({ or: 'documentSource=UPDATE' }), res);

      expect(idsIn(body.data)).to.include(String(KEPT)).and.not.include(String(PROJECT_DOC));
    });

    it('search?dataset=Document gives an anonymous caller no uploads even when it filters on documentSource', async () => {
      const { res, body } = capture();

      await searchController.protectedGet(searchArgs({ and: 'documentSource=UPDATE', auth: ANONYMOUS }), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(KEPT));
    });

    it('GET /document by project (signed in) leaves uploads out', async () => {
      const { res, body } = capture();

      await documentController.protectedGet(docArgs({ project: String(PUBLIC_PROJECT), auth: STAFF }), res);

      const ids = idsIn(body.data);
      expect(ids).to.include(String(PROJECT_DOC));
      expect(ids).to.not.include(String(KEPT));
    });

    it('GET /public/document by docIds still returns a public upload', async () => {
      const { res, body } = capture();

      await documentController.publicGet(docArgs({ docIds: [String(KEPT)] }), res);

      expect(idsIn(body.data)).to.deep.equal([String(KEPT)]);
    });

    it('the project document CSV export leaves uploads out', async () => {
      const csv = await exportProjectDocs(mongoose.connection.db, String(PUBLIC_PROJECT));

      expect(csv).to.include(String(PROJECT_DOC));
      expect(csv).to.not.include(String(KEPT));
    });

    it('GET /public/document by project leaves uploads out', async () => {
      const { res, body } = capture();

      await documentController.publicGet(docArgs({ project: String(PUBLIC_PROJECT) }), res);

      const ids = idsIn(body.data);
      expect(ids).to.include(String(PROJECT_DOC));
      expect(ids).to.not.include(String(KEPT));
    });

    it('GET /public/document by id still returns a public upload', async () => {
      const { res, body } = capture();

      await documentController.publicGet(docArgs({ docId: String(KEPT) }), res);

      expect(idsIn(body.data)).to.deep.equal([String(KEPT)]);
    });
  });
});
