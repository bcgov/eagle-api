/**
 * Sorting /search results on the shared sort and page path, against a real MongoDB.
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

const { TEST_URI, id, PUBLIC_READ, capture, searchArgs, idsIn } = require('./parentReadFixtures');

// Organization ids run opposite to their names, and 'acme' is lower case, so neither id order nor
// a case-sensitive compare can pass for name order.
const CEDAR = id('58990017d334ee001d60fa01');
const BOREALIS = id('58990017d334ee001d60fa02');
const ACME = id('58990017d334ee001d60fa03');
const DENALI = id('58990017d334ee001d60fa04');

const WITH_CEDAR = id('58990017d334ee001d60fb01');
const WITH_ACME_1 = id('58990017d334ee001d60fb02');
const WITH_NO_ORG = id('58990017d334ee001d60fb03');
const WITH_BOREALIS = id('58990017d334ee001d60fb04');
const WITH_ACME_2 = id('58990017d334ee001d60fb05');

const organization = (_id, name, companyType) => ({ _id, _schemaName: 'Organization', read: PUBLIC_READ, name, companyType });

const user = (_id, org) => {
  const doc = { _id, _schemaName: 'User', read: PUBLIC_READ, firstName: 'Pat', lastName: 'Lee' };
  // undefined means the contact never had an organization, which admin allows.
  if (org !== undefined) {
    doc.org = org;
  }
  return doc;
};

const FIXTURES = [
  // Inserted out of every order under test, so an ignored sort or tie-break cannot pass by insertion order.
  organization(DENALI, 'Denali', 'Proponent'),
  organization(ACME, 'acme', 'Proponent'),
  organization(CEDAR, 'Cedar', 'Consultant'),
  organization(BOREALIS, 'Borealis', 'Proponent'),
  user(WITH_ACME_2, ACME),
  user(WITH_BOREALIS, BOREALIS),
  user(WITH_NO_ORG, undefined),
  user(WITH_CEDAR, CEDAR),
  user(WITH_ACME_1, ACME)
];

async function search(dataset, sortBy, pageNum, pageSize) {
  const { res, body } = capture();
  await searchController.protectedGet(searchArgs({ dataset, sortBy, pageNum, pageSize }), res);
  expect(body.code).to.equal(200);
  return body.data;
}

async function allPages(dataset, sortBy, pageSize, count) {
  const pages = [];
  for (let pageNum = 0; pageNum * pageSize < count; pageNum++) {
    pages.push(...idsIn(await search(dataset, sortBy, pageNum, pageSize)));
  }
  return pages;
}

const total = (data) => data[0].meta[0].searchResultsTotal;

describe('Search sort on the shared sort and page path (requires MongoDB)', function () {
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

  describe('Organization by company type', () => {
    const ASCENDING = [CEDAR, BOREALIS, ACME, DENALI].map(String);
    const DESCENDING = [BOREALIS, ACME, DENALI, CEDAR].map(String);

    it('orders ascending and breaks ties by _id', async () => {
      expect(idsIn(await search('Organization', '+companyType'))).to.deep.equal(ASCENDING);
    });

    it('orders descending and still breaks ties by _id ascending', async () => {
      expect(idsIn(await search('Organization', '-companyType'))).to.deep.equal(DESCENDING);
    });

    it('keeps a tie on the same side of a page break', async () => {
      expect(await allPages('Organization', '+companyType', 2, ASCENDING.length)).to.deep.equal(ASCENDING);
      expect(await allPages('Organization', '-companyType', 2, DESCENDING.length)).to.deep.equal(DESCENDING);
    });
  });

  // The Organization column of admin's contacts table sends org.name.
  describe('User (contacts) by organization name', () => {
    const ASCENDING = [WITH_NO_ORG, WITH_ACME_1, WITH_ACME_2, WITH_BOREALIS, WITH_CEDAR].map(String);
    const DESCENDING = [WITH_CEDAR, WITH_BOREALIS, WITH_ACME_1, WITH_ACME_2, WITH_NO_ORG].map(String);

    it('orders by organization name ascending, ignoring case, with no organization first', async () => {
      expect(idsIn(await search('User', '+org.name'))).to.deep.equal(ASCENDING);
    });

    it('orders by organization name descending, with no organization last', async () => {
      expect(idsIn(await search('User', '-org.name'))).to.deep.equal(DESCENDING);
    });

    it('keeps a tie on the same side of a page break', async () => {
      expect(await allPages('User', '+org.name', 2, ASCENDING.length)).to.deep.equal(ASCENDING);
      expect(await allPages('User', '-org.name', 2, DESCENDING.length)).to.deep.equal(DESCENDING);
    });

    it('lists and counts a contact with no organization', async () => {
      const data = await search('User');
      const noOrg = data[0].searchResults.find(row => String(row._id) === String(WITH_NO_ORG));

      expect(total(data)).to.equal(ASCENDING.length);
      expect(noOrg).to.exist.and.to.not.have.property('org');
    });

    it('returns the joined organization on the other contacts', async () => {
      const rows = (await search('User', '+org.name'))[0].searchResults;

      expect(rows.filter(row => row.org).map(row => row.org.name)).to.deep.equal(['acme', 'acme', 'Borealis', 'Cedar']);
    });
  });
});
