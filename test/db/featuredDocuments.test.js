/**
 * Featured documents against a real MongoDB.
 *
 * GET /Public/project/{projId}/FeaturedDocuments used to return every featured document of the
 * project, published or not, and served projects the public cannot read.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');

require('../../app_helper');

const projectController = require('../../api/controllers/project');

const {
  TEST_URI,
  id,
  STAFF_ONLY,
  PUBLIC_READ,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

const PUBLISHED_FEATURED = id('58990017d334ee001d608f01');
const UNPUBLISHED_FEATURED = id('58990017d334ee001d608f02');
const FEATURED_UNDER_PRIVATE_PROJECT = id('58990017d334ee001d608f03');

const document = (_id, project, read, isFeatured) => ({
  _id,
  _schemaName: 'Document',
  read,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project,
  isFeatured,
  displayName: 'doc ' + _id
});

const FIXTURES = [
  ...PARENT_FIXTURES,
  document(PUBLISHED_FEATURED, PUBLIC_PROJECT, PUBLIC_READ, true),
  document(UNPUBLISHED_FEATURED, PUBLIC_PROJECT, STAFF_ONLY, true),
  document(FEATURED_UNDER_PRIVATE_PROJECT, PRIVATE_PROJECT, PUBLIC_READ, true)
];

const args = (projId) => ({ swagger: { params: { projId: { value: String(projId) } } } });

describe('project featured documents (requires MongoDB)', function () {
  this.timeout(30000);

  before(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
  });

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  describe('GET /Public/project/{projId}/FeaturedDocuments', () => {
    it('returns the published featured document', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocuments(args(PUBLIC_PROJECT), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.include(String(PUBLISHED_FEATURED));
    });

    it('leaves out the unpublished featured document', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocuments(args(PUBLIC_PROJECT), res);

      expect(idsIn(body.data)).to.not.include(String(UNPUBLISHED_FEATURED));
    });

    it('answers 404 for a project the public cannot read', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocuments(args(PRIVATE_PROJECT), res);

      expect(body.code).to.equal(404);
    });

    it('answers 404 for a projId that is not an ObjectId', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocuments(args('not-an-object-id'), res);

      expect(body.code).to.equal(404);
    });

    it('answers 404 for a well-formed projId with no project', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocuments(args('58990017d334ee001d60ffff'), res);

      expect(body.code).to.equal(404);
    });
  });

  describe('GET /project/{projId}/FeaturedDocuments', () => {
    it('still returns published and unpublished featured documents', async () => {
      const { res, body } = capture();
      await projectController.getFeaturedDocumentsSecure(args(PUBLIC_PROJECT), res);

      expect(body.code).to.equal(200);
      expect(idsIn(body.data)).to.have.members([String(PUBLISHED_FEATURED), String(UNPUBLISHED_FEATURED)]);
    });
  });
});
