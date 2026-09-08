/**
 * Document visibility against a real MongoDB.
 *
 * A document's own `read[]` says nothing about its parent, so a published document under an
 * unpublished project or notification used to be served to anonymous callers by
 * /api/search?dataset=Document, /api/public/document, /api/document and the download, fetch and
 * open routes. These specs drive the real controllers so the assertions are about what a caller
 * gets back, not about pipeline shape.
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
const MinioController = require('../../api/helpers/minio');
const analytics = require('../../api/helpers/analytics');
const searchController = require('../../api/controllers/search');
const documentController = require('../../api/controllers/document');

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
  MISSING_READ_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

// Documents below are all published themselves; only their parent differs.
const DOC_UNDER_PUBLIC_PROJECT = id('58990017d334ee001d608d01');
const DOC_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d608d02');
const DOC_UNDER_PUBLIC_NOTIFICATION = id('6a288e6d6452d0c8edd7d33a');
const DOC_UNDER_PRIVATE_NOTIFICATION = id('6a288e6d6452d0c8edd7d44a');
const DOC_WITH_NO_PARENT = id('58990017d334ee001d608d03');
const DOC_UNDER_PUBLIC_ONLY_PROJECT = id('58990017d334ee001d608d04');
const DOC_UNDER_EMPTY_READ_PROJECT = id('58990017d334ee001d608d05');
const DOC_UNDER_MISSING_READ_PROJECT = id('58990017d334ee001d608d06');

const document = (_id, parent, name) => ({
  _id,
  _schemaName: 'Document',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: parent,
  displayName: name,
  documentFileName: name.replace(/ /g, '-') + '.pdf',
  internalURL: 'docs/' + name.replace(/ /g, '-') + '.pdf',
  internalExt: 'pdf',
  internalMime: 'application/pdf',
  documentType: 'Report',
  eaoStatus: 'Published',
  isPublished: true,
  datePosted: new Date('2026-01-01'),
  publicHitCount: 0,
  secureHitCount: 0
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  document(DOC_UNDER_PUBLIC_PROJECT, PUBLIC_PROJECT, 'under public project'),
  document(DOC_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, 'under unpublished project'),
  document(DOC_UNDER_PUBLIC_NOTIFICATION, PUBLIC_NOTIFICATION, 'under public notification'),
  document(DOC_UNDER_PRIVATE_NOTIFICATION, PRIVATE_NOTIFICATION, 'under unpublished notification'),
  document(DOC_WITH_NO_PARENT, null, 'orphan'),
  document(DOC_UNDER_PUBLIC_ONLY_PROJECT, PUBLIC_ONLY_PROJECT, 'under public only project'),
  document(DOC_UNDER_EMPTY_READ_PROJECT, EMPTY_READ_PROJECT, 'under unset read project'),
  document(DOC_UNDER_MISSING_READ_PROJECT, MISSING_READ_PROJECT, 'under no read field project')
];

const FILE_META = { size: 12, metaData: { 'content-type': 'application/pdf' } };

function searchArgs(roles) {
  return {
    swagger: {
      params: {
        _id: { value: null },
        keywords: { value: '' },
        dataset: { value: 'Document' },
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

// /public/document and /public/document/{docId} share publicGet; docId picks the single-record form.
function publicArgs({ docId = null, docIds = null } = {}) {
  return {
    swagger: {
      params: {
        docId: { value: docId },
        docIds: { value: docIds },
        project: { value: null },
        fields: { value: ['displayName', 'project', 'isPublished', 'eaoStatus'] }
      }
    }
  };
}

function protectedArgs(roles, { docId = null, docIds = null } = {}) {
  return {
    swagger: {
      params: {
        docId: { value: docId },
        docIds: { value: docIds },
        project: { value: null },
        fields: { value: ['displayName', 'project', 'isPublished', 'eaoStatus'] },
        auth_payload: { realm_access: { roles }, preferred_username: roles.join(','), sub: 'sub-' + roles.join(',') }
      }
    }
  };
}

function headArgs(roles, docId) {
  return {
    swagger: {
      params: {
        docId: { value: docId },
        _application: { value: null },
        _comment: { value: null },
        isDeleted: { value: undefined },
        auth_payload: { realm_access: { roles }, preferred_username: roles.join(',') }
      }
    }
  };
}

function downloadArgs(docId, roles) {
  const params = { docId: { value: String(docId) }, filename: { value: null } };
  if (roles) {
    params.auth_payload = { realm_access: { roles }, preferred_username: roles.join(','), sub: 'sub-' + roles.join(',') };
  }
  return { swagger: { params } };
}

describe('document parent visibility (requires MongoDB)', function () {
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

  describe('GET /api/search?dataset=Document', () => {
    it('hides a published document whose parent project is unpublished from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(DOC_UNDER_PRIVATE_PROJECT));
    });

    it('still returns that document to a staff caller', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PRIVATE_PROJECT));
    });

    it('returns a published document under a public project to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PUBLIC_PROJECT));
    });

    it('returns a document under a public ProjectNotification to an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PUBLIC_NOTIFICATION));
    });

    it('hides a document under an unpublished ProjectNotification from an anonymous caller', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.not.include(String(DOC_UNDER_PRIVATE_NOTIFICATION));
    });

    it('keeps a document whose parent reference resolves to nothing', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(DOC_WITH_NO_PARENT));
    });

    it('returns a document under a public-only project to a staff caller who has no public role', async () => {
      const { res, body } = capture();
      await searchController.protectedGet(searchArgs(['staff']), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PUBLIC_ONLY_PROJECT));
    });

    it('treats a parent with an empty read[] as public', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(DOC_UNDER_EMPTY_READ_PROJECT));
    });

    it('treats a parent with no read field as public', async () => {
      const { res, body } = capture();
      await searchController.publicGet(searchArgs(['public']), res);

      expect(idsIn(body.data)).to.include(String(DOC_UNDER_MISSING_READ_PROJECT));
    });
  });

  describe('GET /api/public/document', () => {
    it('hides a published document whose parent project is unpublished', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs(), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.not.include(String(DOC_UNDER_PRIVATE_PROJECT));
    });

    it('hides a document under an unpublished ProjectNotification', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs(), res);

      expect(idsIn(body.data)).to.not.include(String(DOC_UNDER_PRIVATE_NOTIFICATION));
    });

    it('returns documents under a public project and a public notification', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs(), res);

      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PUBLIC_PROJECT));
      expect(idsIn(body.data)).to.include(String(DOC_UNDER_PUBLIC_NOTIFICATION));
    });

    it('keeps a document whose parent reference resolves to nothing', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs(), res);

      expect(idsIn(body.data)).to.include(String(DOC_WITH_NO_PARENT));
    });
  });

  describe('GET /api/public/document/{docId}', () => {
    it('returns nothing for a document whose parent project is unpublished', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs({ docId: String(DOC_UNDER_PRIVATE_PROJECT) }), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });

    it('returns a document whose parent project is public', async () => {
      const { res, body } = capture();
      await documentController.publicGet(publicArgs({ docId: String(DOC_UNDER_PUBLIC_PROJECT) }), res);

      expect(idsIn(body.data)).to.deep.equal([String(DOC_UNDER_PUBLIC_PROJECT)]);
    });
  });

  // /document carries x-anonymous-read, so protectedGet is reachable without a token and
  // swagger-security hands it roles ['public'].
  describe('GET /api/document?docIds=', () => {
    const requested = [String(DOC_UNDER_PRIVATE_PROJECT), String(DOC_UNDER_PUBLIC_PROJECT)];

    it('drops the document whose parent project is unpublished for an anonymous caller', async () => {
      const { res, body } = capture();
      await documentController.protectedGet(protectedArgs(['public'], { docIds: requested }), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.deep.equal([String(DOC_UNDER_PUBLIC_PROJECT)]);
    });

    it('returns both documents to a staff caller', async () => {
      const { res, body } = capture();
      await documentController.protectedGet(protectedArgs(['staff'], { docIds: requested }), res);

      expect(idsIn(body.data)).to.have.members(requested);
    });
  });

  describe('GET /api/document/{docId}', () => {
    it('returns nothing to an anonymous caller when the parent project is unpublished', async () => {
      const { res, body } = capture();
      await documentController.protectedGet(protectedArgs(['public'], { docId: String(DOC_UNDER_PRIVATE_PROJECT) }), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.be.empty;
    });
  });

  // No route maps to protectedHead today. Asserted anyway so the gate holds if one is added.
  describe('document.protectedHead', () => {
    it('counts nothing for an anonymous caller when the parent project is unpublished', async () => {
      const { res, body } = capture();
      await documentController.protectedHead(headArgs(['public'], String(DOC_UNDER_PRIVATE_PROJECT)), res);

      expect(body.data[0].total_items).to.equal(0);
    });

    it('counts that document for a staff caller', async () => {
      const { res, body } = capture();
      await documentController.protectedHead(headArgs(['staff'], String(DOC_UNDER_PRIVATE_PROJECT)), res);

      expect(body.data[0].total_items).to.equal(1);
    });
  });

  describe('document binary routes', () => {
    beforeEach(() => {
      sinon.stub(MinioController, 'statObject').resolves(FILE_META);
      sinon.stub(MinioController, 'getPresignedGETUrl').resolves('http://minio.invalid/doc.pdf');
      sinon.stub(Utils, 'getUrlAsStream').resolves({ pipe: sinon.stub() });
      sinon.stub(analytics, 'trackEvent');
    });

    it('GET /api/public/document/{docId}/download does not reach storage for a document under an unpublished project', async () => {
      const { res, body } = capture();
      await documentController.publicDownload(downloadArgs(DOC_UNDER_PRIVATE_PROJECT), res);

      expect(body.code).to.equal(404);
      expect(MinioController.statObject.called).to.be.false;
    });

    it('GET /api/public/document/{docId}/download still serves a document under a public project', async () => {
      const { res } = capture();
      await documentController.publicDownload(downloadArgs(DOC_UNDER_PUBLIC_PROJECT), res);

      expect(MinioController.statObject.calledOnce).to.be.true;
      expect(Utils.getUrlAsStream.calledOnce).to.be.true;
    });

    it('GET /api/document/{docId}/download does not reach storage for an anonymous caller under an unpublished project', async () => {
      const { res, body } = capture();
      await documentController.protectedDownload(downloadArgs(DOC_UNDER_PRIVATE_PROJECT, ['public']), res);

      expect(body.code).to.equal(404);
      expect(MinioController.statObject.called).to.be.false;
    });

    it('GET /api/document/{docId}/download still serves that document to a staff caller', async () => {
      const { res } = capture();
      await documentController.protectedDownload(downloadArgs(DOC_UNDER_PRIVATE_PROJECT, ['staff']), res);

      expect(MinioController.statObject.calledOnce).to.be.true;
      expect(Utils.getUrlAsStream.calledOnce).to.be.true;
    });

    it('GET /api/document/{docId}/fetch/{filename} does not reach storage for an anonymous caller under an unpublished notification', async () => {
      const { res, body } = capture();
      await documentController.protectedOpen(downloadArgs(DOC_UNDER_PRIVATE_NOTIFICATION, ['public']), res);

      expect(body.code).to.equal(404);
      expect(MinioController.statObject.called).to.be.false;
    });

    it('GET /api/document/{docId}/fetch/{filename} still serves a document under a public project to an anonymous caller', async () => {
      const { res } = capture();
      await documentController.protectedOpen(downloadArgs(DOC_UNDER_PUBLIC_PROJECT, ['public']), res);

      expect(MinioController.statObject.calledOnce).to.be.true;
      expect(Utils.getUrlAsStream.calledOnce).to.be.true;
    });
  });
});
