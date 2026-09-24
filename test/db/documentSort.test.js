/**
 * Sorting Document search results (populate=true) against a real MongoDB.
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

const { TEST_URI, id, STAFF_ONLY, PUBLIC_READ, capture, searchArgs, idsIn } = require('./parentReadFixtures');

// Neither project nor document ids follow name order, and 'alpha' is lower case, so neither id
// order nor a case-sensitive compare can pass for name order.
const CHARLIE = id('58990017d334ee001d60fa01');
const ALPHA = id('58990017d334ee001d60fa02');
const BRAVO = id('58990017d334ee001d60fa03');
const DELETED_PROJECT = id('58990017d334ee001d60fa04');

const ON_BRAVO = id('58990017d334ee001d60fc01');
const NO_PROJECT = id('58990017d334ee001d60fc02');
const ON_CHARLIE = id('58990017d334ee001d60fc03');
const ON_ALPHA_1 = id('58990017d334ee001d60fc04');
const ON_ALPHA_2 = id('58990017d334ee001d60fc05');
const ON_DELETED_PROJECT = id('58990017d334ee001d60fc06');

// List ids run opposite to their names, and 'letter' is lower case, so neither id order nor a
// case-sensitive compare can pass for the label order the admin tables show.
const REPORT = id('58990017d334ee001d60fd01');
const LETTER = id('58990017d334ee001d60fd02');
const AMENDMENT = id('58990017d334ee001d60fd03');
const SCOPING = id('58990017d334ee001d60fe01');
const APPLICATION = id('58990017d334ee001d60fe02');
// Points at nothing, as a milestone removed from the List collection would.
const DANGLING_MILESTONE = id('58990017d334ee001d60fe09');

// Names that match an existing List item or project except for case.
const REPORT_LOWER = id('58990017d334ee001d60fd04');
const SCOPING_LOWER = id('58990017d334ee001d60fe03');
const BRAVO_LOWER = id('58990017d334ee001d60fa05');
// One id below every fixture Document and one above, so only a shared rank puts them at both ends of their group.
const CASE_LOW = id('58990017d334ee001d60fb01');
const CASE_HIGH = id('58990017d334ee001d60fc07');

// Staff-only, and first by name, so a leak would take the first named slot.
const PRIVATE_PROJECT = id('58990017d334ee001d60fa06');
const ON_PRIVATE_PROJECT = id('58990017d334ee001d60fb02');

const LATER_DAY = id('58990017d334ee001d60fc08');

const list = (_id, type, name) => ({ _id, _schemaName: 'List', read: PUBLIC_READ, type, name });

const project = (_id, name, read = PUBLIC_READ) => ({
  _id,
  _schemaName: 'Project',
  read,
  currentLegislationYear: 'legislation_2018',
  legislation_2018: { name }
});

// All on one day, so a sort cut to the day ties them and only a full-time sort tells them apart.
const document = (_id, projectId, type, milestone, hour, day = 1) => ({
  _id,
  type,
  milestone,
  _schemaName: 'Document',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: projectId,
  displayName: 'Report',
  datePosted: new Date(Date.UTC(2026, 0, day, hour))
});

const FIXTURES = [
  project(CHARLIE, 'Charlie'),
  project(ALPHA, 'alpha'),
  project(BRAVO, 'Bravo'),
  list(REPORT, 'doctype', 'Report'),
  list(LETTER, 'doctype', 'letter'),
  list(AMENDMENT, 'doctype', 'Amendment'),
  list(SCOPING, 'label', 'Scoping'),
  list(APPLICATION, 'label', 'application'),
  // Inserted out of every order under test, so an ignored sort cannot pass by insertion order.
  document(ON_BRAVO, BRAVO, REPORT, SCOPING, 9),
  document(ON_DELETED_PROJECT, DELETED_PROJECT, REPORT, null, 14),
  document(ON_CHARLIE, CHARLIE, null, APPLICATION, 11),
  document(NO_PROJECT, null, LETTER, APPLICATION, 16),
  document(ON_ALPHA_2, ALPHA, LETTER, SCOPING, 8),
  document(ON_ALPHA_1, ALPHA, AMENDMENT, DANGLING_MILESTONE, 12)
];

const BY_ID = [ON_BRAVO, NO_PROJECT, ON_CHARLIE, ON_ALPHA_1, ON_ALPHA_2, ON_DELETED_PROJECT].map(String);
const BY_TIME_DESCENDING = [NO_PROJECT, ON_DELETED_PROJECT, ON_ALPHA_1, ON_CHARLIE, ON_BRAVO, ON_ALPHA_2].map(String);
const BY_PROJECT_NAME = [NO_PROJECT, ON_DELETED_PROJECT, ON_ALPHA_1, ON_ALPHA_2, ON_BRAVO, ON_CHARLIE].map(String);
// A missing or dangling List id sorts lowest; ties break on _id ascending either way.
const LABEL_ORDERS = {
  type: {
    asc: [ON_CHARLIE, ON_ALPHA_1, NO_PROJECT, ON_ALPHA_2, ON_BRAVO, ON_DELETED_PROJECT].map(String),
    desc: [ON_BRAVO, ON_DELETED_PROJECT, NO_PROJECT, ON_ALPHA_2, ON_ALPHA_1, ON_CHARLIE].map(String)
  },
  milestone: {
    asc: [ON_ALPHA_1, ON_DELETED_PROJECT, NO_PROJECT, ON_CHARLIE, ON_BRAVO, ON_ALPHA_2].map(String),
    desc: [ON_BRAVO, ON_ALPHA_2, NO_PROJECT, ON_CHARLIE, ON_ALPHA_1, ON_DELETED_PROJECT].map(String)
  }
};

async function search(sortBy, pageNum, pageSize, populate = true) {
  const { res, body } = capture();
  await searchController.protectedGet(searchArgs({ dataset: 'Document', sortBy, pageNum, pageSize, populate }), res);
  expect(body.code).to.equal(200);
  return body.data;
}

async function allPages(sortBy, pageSize) {
  const pages = [];
  for (let pageNum = 0; pageNum * pageSize < BY_ID.length; pageNum++) {
    pages.push(...idsIn(await search(sortBy, pageNum, pageSize)));
  }
  return pages;
}

const projectNames = (data) => data[0].searchResults.map(row => row.project && row.project.name).filter(Boolean);

const insert = (docs) => mongoose.connection.collection('epic').insertMany(docs);

// An anonymous /public/search call: no token, so the caller is 'public' alone.
async function publicSearch(sortBy, pageNum, pageSize) {
  const { res, body } = capture();
  const args = searchArgs({ dataset: 'Document', sortBy, pageNum, pageSize, populate: true });
  delete args.swagger.params.auth_payload;
  await searchController.publicGet(args, res);
  expect(body.code).to.equal(200);
  return body.data;
}

// Where the Document pipeline cuts the page and where it joins the project, as sent to MongoDB.
async function pageAndJoin(sortBy) {
  const aggregate = sinon.spy(mongoose.model('Document'), 'aggregate');
  await search(sortBy, 0, 2);
  const pipeline = aggregate.firstCall.args[0];
  return {
    page: pipeline.findIndex(stage => stage.$facet && stage.$facet.searchResults.some(inner => inner.$limit)),
    join: pipeline.findIndex(stage => stage.$lookup && stage.$lookup.localField === 'project')
  };
}

describe('Document search sort (requires MongoDB)', function () {
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

  describe('by project name', () => {
    it('orders Documents by project name ascending, ignoring case', async () => {
      const data = await search('+project.name');

      expect(projectNames(data)).to.deep.equal(['alpha', 'alpha', 'Bravo', 'Charlie']);
    });

    it('orders Documents by project name descending', async () => {
      const data = await search('-project.name');

      expect(projectNames(data)).to.deep.equal(['Charlie', 'Bravo', 'alpha', 'alpha']);
    });

    it('sorts the whole set before cutting pages, breaking name ties by _id', async () => {
      const second = await search('+project.name', 1, 2);

      expect(await allPages('+project.name', 2)).to.deep.equal(BY_PROJECT_NAME);
      expect(second[0].meta[0].searchResultsTotal).to.equal(BY_PROJECT_NAME.length);
    });

    it('puts Documents with no project, or a missing one, first ascending and last descending', async () => {
      const ascending = idsIn(await search('+project.name'));
      const descending = idsIn(await search('-project.name'));

      expect(ascending.slice(0, 2)).to.deep.equal([String(NO_PROJECT), String(ON_DELETED_PROJECT)]);
      expect(descending.slice(-2)).to.deep.equal([String(NO_PROJECT), String(ON_DELETED_PROJECT)]);
    });

    it('still returns the joined project and nothing it used to sort', async () => {
      const rows = (await search('+project.name'))[0].searchResults;
      const byId = Object.fromEntries(rows.map(row => [String(row._id), row]));

      expect(byId[String(ON_BRAVO)].project.name).to.equal('Bravo');
      expect(rows.filter(row => '_sortRank' in row).map(row => String(row._id))).to.deep.equal([]);
    });

    it('cuts the page before the project join', async () => {
      const { page, join } = await pageAndJoin('+project.name');

      expect(page).to.be.greaterThan(-1);
      expect(join).to.be.greaterThan(page);
    });
  });

  describe('names that differ only by case', () => {
    beforeEach(async () => {
      await insert([
        list(REPORT_LOWER, 'doctype', 'report'),
        list(SCOPING_LOWER, 'label', 'scoping'),
        project(BRAVO_LOWER, 'bravo'),
        document(CASE_HIGH, BRAVO_LOWER, REPORT_LOWER, SCOPING_LOWER, 13),
        document(CASE_LOW, BRAVO_LOWER, REPORT_LOWER, SCOPING_LOWER, 10)
      ]);
    });

    // Report/report, Scoping/scoping and Bravo/bravo each form one group, ordered by _id within it.
    const CASE_ORDERS = {
      type: [ON_CHARLIE, ON_ALPHA_1, NO_PROJECT, ON_ALPHA_2, CASE_LOW, ON_BRAVO, ON_DELETED_PROJECT, CASE_HIGH],
      milestone: [ON_ALPHA_1, ON_DELETED_PROJECT, NO_PROJECT, ON_CHARLIE, CASE_LOW, ON_BRAVO, ON_ALPHA_2, CASE_HIGH],
      'project.name': [NO_PROJECT, ON_DELETED_PROJECT, ON_ALPHA_1, ON_ALPHA_2, CASE_LOW, ON_BRAVO, CASE_HIGH, ON_CHARLIE]
    };

    Object.entries(CASE_ORDERS).forEach(([key, order]) => {
      it(`gives ${key} names equal but for case one rank, then orders by _id`, async () => {
        expect(idsIn(await search(`+${key}`))).to.deep.equal(order.map(String));
      });
    });
  });

  describe('by type and milestone together', () => {
    it('orders by type, then by milestone within a type', async () => {
      expect(idsIn(await search('+type,-milestone'))).to.deep.equal(
        [ON_CHARLIE, ON_ALPHA_1, ON_ALPHA_2, NO_PROJECT, ON_BRAVO, ON_DELETED_PROJECT].map(String));
    });
  });

  describe('by day posted, then a List label', () => {
    beforeEach(async () => {
      await insert([document(LATER_DAY, BRAVO, REPORT, SCOPING, 1, 2)]);
    });

    it('orders by day first, then by the List name within a day', async () => {
      expect(idsIn(await search('-datePosted,+type'))).to.deep.equal(
        [LATER_DAY, ON_CHARLIE, ON_ALPHA_1, NO_PROJECT, ON_ALPHA_2, ON_BRAVO, ON_DELETED_PROJECT].map(String));
    });
  });

  describe('for a public caller', () => {
    beforeEach(async () => {
      await insert([
        project(PRIVATE_PROJECT, 'Aardvark', STAFF_ONLY),
        document(ON_PRIVATE_PROJECT, PRIVATE_PROJECT, REPORT, SCOPING, 7)
      ]);
    });

    it('neither shows nor counts Documents under a private project when sorting by project name', async () => {
      const first = await publicSearch('+project.name', 0, 4);
      const second = await publicSearch('+project.name', 1, 4);

      expect([...idsIn(first), ...idsIn(second)]).to.deep.equal(BY_PROJECT_NAME);
      expect(first[0].meta[0].searchResultsTotal).to.equal(BY_PROJECT_NAME.length);
      expect(JSON.stringify([first, second])).to.not.include('Aardvark');
    });
  });

  Object.entries(LABEL_ORDERS).forEach(([key, { asc, desc }]) => {
    describe(`by ${key}, a List id shown as its name`, () => {
      it('orders by the List name ascending, ignoring case', async () => {
        expect(idsIn(await search(`+${key}`))).to.deep.equal(asc);
      });

      it('orders by the List name descending', async () => {
        expect(idsIn(await search(`-${key}`))).to.deep.equal(desc);
      });

      it('keeps a tie on the same side of a page break', async () => {
        expect(await allPages(`+${key}`, 3)).to.deep.equal(asc);
        expect(await allPages(`-${key}`, 3)).to.deep.equal(desc);
      });

      it('orders by the List name without populate, as the add-documents picker asks', async () => {
        expect(idsIn(await search(`+${key}`, 0, 100, false))).to.deep.equal(asc);
      });

      it('still returns the List id and nothing it used to sort', async () => {
        const rows = (await search(`+${key}`))[0].searchResults;
        const byId = Object.fromEntries(rows.map(row => [String(row._id), row]));

        expect(String(byId[String(ON_BRAVO)][key])).to.equal(String(key === 'type' ? REPORT : SCOPING));
        rows.forEach(row => expect(row).to.not.have.property('_sortRank'));
      });
    });
  });

  describe('by a Document field', () => {
    it('breaks ties by _id across pages ascending', async () => {
      expect(await allPages('+status', 4)).to.deep.equal(BY_ID);
    });

    it('breaks ties by _id across pages descending', async () => {
      expect(await allPages('-status', 4)).to.deep.equal(BY_ID);
    });

    it('breaks ties by _id across pages for the default date and name sort', async () => {
      expect(await allPages('-datePosted,+displayName', 4)).to.deep.equal(BY_ID);
    });

    // Only a multi-key sort cuts datePosted to the day; the tie-break must not make a single key look like one.
    it('orders a lone datePosted sort by the full time', async () => {
      expect(idsIn(await search('-datePosted'))).to.deep.equal(BY_TIME_DESCENDING);
    });

    it('returns no day field from a multi-key datePosted sort', async () => {
      const rows = (await search('-datePosted,+displayName'))[0].searchResults;

      expect(rows).to.have.lengthOf(BY_ID.length);
      expect(rows.filter(row => 'date' in row).map(row => String(row._id))).to.deep.equal([]);
    });

    it('cuts the page before the project join', async () => {
      const { page, join } = await pageAndJoin('-datePosted');

      expect(page).to.be.greaterThan(-1);
      expect(join).to.be.greaterThan(page);
    });
  });

  describe('with no sortBy', () => {
    it('pages in _id order', async () => {
      expect(await allPages(undefined, 4)).to.deep.equal(BY_ID);
    });
  });
});
