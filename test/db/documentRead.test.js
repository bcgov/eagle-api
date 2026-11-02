/**
 * A document's own read[] decides which roles find it through /search.
 * Needs real MongoDB, so not in `npm test`: `npm run db:up && npm run test:db` (MONGODB_TEST_URI).
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
  PUBLIC_PROJECT,
  PARENT_FIXTURES,
  capture,
  searchArgs,
  idsIn
} = require('./parentReadFixtures');

const PUBLIC_DOC = id('58990017d334ee001d608e01');
const STAFF_DOC = id('58990017d334ee001d608e02');
const SYSADMIN_DOC = id('58990017d334ee001d608e03');

// The parent is public, so only the document's own read[] can hide it.
const document = (_id, read, name) => ({
  _id,
  _schemaName: 'Document',
  read,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: PUBLIC_PROJECT,
  displayName: name,
  documentFileName: name + '.pdf',
  internalURL: 'docs/' + name + '.pdf',
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
  document(PUBLIC_DOC, ['public'], 'public-doc'),
  // read[] is a flat role match with no hierarchy; staff records are written with both roles.
  document(STAFF_DOC, STAFF_ONLY, 'staff-doc'),
  document(SYSADMIN_DOC, ['sysadmin'], 'sysadmin-doc')
];

const documentSearch = (roles) => searchArgs({ dataset: 'Document', roles });

describe('document read[] on /search (requires MongoDB)', function () {
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
    sinon.stub(Utils, 'recordAction').resolves();
  });

  afterEach(() => sinon.restore());

  it('gives an anonymous caller only the public document', async () => {
    const { res, body } = capture();
    await searchController.publicGet(documentSearch(['public']), res);

    expect(body.code).to.equal(200);
    expect(idsIn(body.data)).to.deep.equal([String(PUBLIC_DOC)]);
  });

  it('gives staff the public and staff documents, never the sysadmin one', async () => {
    const { res, body } = capture();
    await searchController.protectedGet(documentSearch(['staff']), res);

    expect(body.code).to.equal(200);
    expect(idsIn(body.data)).to.have.members([String(PUBLIC_DOC), String(STAFF_DOC)]);
  });

  it('gives sysadmin all three documents', async () => {
    const { res, body } = capture();
    await searchController.protectedGet(documentSearch(['sysadmin']), res);

    expect(body.code).to.equal(200);
    expect(idsIn(body.data)).to.have.members([String(PUBLIC_DOC), String(STAFF_DOC), String(SYSADMIN_DOC)]);
  });
});
