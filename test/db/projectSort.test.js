/**
 * Sorting the admin project list and search screens (Project, default legislation) against a real MongoDB.
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

const X1 = id('58990017d334ee001d60fa01');
const X2 = id('58990017d334ee001d60fa02');
const X3 = id('58990017d334ee001d60fa03');
const X4 = id('58990017d334ee001d60fa04');

// Joined ids run opposite to their names, so sorting on the raw id cannot pass for name order.
const CEDAR = id('58990017d334ee001d60fb01');
const BOREALIS = id('58990017d334ee001d60fb02');
const ACME = id('58990017d334ee001d60fb03');
const READINESS = id('58990017d334ee001d60fc01');
const PRE_EA = id('58990017d334ee001d60fc02');
const EARLY = id('58990017d334ee001d60fc03');
// Points at nothing, as a phase removed from the List collection would.
const DANGLING_PHASE = id('58990017d334ee001d60fc09');
const TERMINATED = id('58990017d334ee001d60fd01');
const IN_PROGRESS = id('58990017d334ee001d60fd02');
const APPROVED = id('58990017d334ee001d60fd03');
const SCREENING = id('58990017d334ee001d60fe01');
const PANEL = id('58990017d334ee001d60fe02');
const COMPREHENSIVE = id('58990017d334ee001d60fe03');
const TIER_2 = id('58990017d334ee001d60ff01');
const REVIEWABLE = id('58990017d334ee001d60ff02');
const EXEMPT = id('58990017d334ee001d60ff03');

// score stands in for the keyword relevance a $text search writes onto the project root.
const project = (_id, score, fields) => ({
  _id,
  _schemaName: 'Project',
  read: PUBLIC_READ,
  score,
  currentLegislationYear: 'legislation_2018',
  legislation_2018: fields
});

const named = (_id, _schemaName, name) => ({ _id, _schemaName, read: PUBLIC_READ, name });

const FIXTURES = [
  named(CEDAR, 'Organization', 'Cedar'),
  named(BOREALIS, 'Organization', 'Borealis'),
  named(ACME, 'Organization', 'acme'),
  named(READINESS, 'List', 'Readiness'),
  named(PRE_EA, 'List', 'Pre-EA'),
  named(EARLY, 'List', 'Early Engagement'),
  named(TERMINATED, 'List', 'Terminated'),
  named(IN_PROGRESS, 'List', 'In Progress'),
  named(APPROVED, 'List', 'approved'),
  named(SCREENING, 'List', 'Screening'),
  named(PANEL, 'List', 'Panel'),
  named(COMPREHENSIVE, 'List', 'comprehensive'),
  named(TIER_2, 'List', 'Tier 2'),
  named(REVIEWABLE, 'List', 'reviewable'),
  named(EXEMPT, 'List', 'Exempt'),
  // Inserted out of every order under test, so an ignored sort cannot pass by insertion order.
  project(X3, 1.1, { name: 'Alpha', type: 'Energy', region: 'Skeena', proponent: ACME, currentPhaseName: DANGLING_PHASE, eacDecision: TERMINATED, CEAAInvolvement: PANEL, applicableRegulation: TIER_2 }),
  project(X1, 1.9, { name: 'Delta', type: 'Mines', region: 'Skeena', proponent: CEDAR, currentPhaseName: PRE_EA, eacDecision: IN_PROGRESS, CEAAInvolvement: COMPREHENSIVE, applicableRegulation: REVIEWABLE }),
  project(X4, 1.7, { name: 'Charlie', type: 'Transportation', region: 'Omineca', proponent: BOREALIS, currentPhaseName: READINESS, applicableRegulation: TIER_2 }),
  project(X2, 1.5, { name: 'bravo', type: 'Water Management', region: 'Cariboo', proponent: null, currentPhaseName: EARLY, eacDecision: APPROVED, CEAAInvolvement: SCREENING, applicableRegulation: EXEMPT })
];

// Ties break on _id ascending whichever way the key runs, and a missing join sorts lowest.
const ORDERS = {
  name: { asc: [X3, X2, X4, X1], desc: [X1, X4, X2, X3] },
  type: { asc: [X3, X1, X4, X2], desc: [X2, X4, X1, X3] },
  region: { asc: [X2, X4, X1, X3], desc: [X1, X3, X4, X2] },
  'proponent.name': { asc: [X2, X3, X4, X1], desc: [X1, X4, X3, X2] },
  // A bare joined field is a whole document after the join; it orders by the name the table shows.
  proponent: { asc: [X2, X3, X4, X1], desc: [X1, X4, X3, X2] },
  currentPhaseName: { asc: [X3, X2, X1, X4], desc: [X4, X1, X2, X3] },
  eacDecision: { asc: [X4, X2, X1, X3], desc: [X3, X1, X2, X4] },
  CEAAInvolvement: { asc: [X4, X1, X3, X2], desc: [X2, X3, X1, X4] },
  applicableRegulation: { asc: [X2, X1, X3, X4], desc: [X3, X4, X1, X2] },
  score: { asc: [X3, X2, X4, X1], desc: [X1, X4, X2, X3] }
};

async function search(options) {
  const { res, body } = capture();
  // The query admin's project list and search screens send when a column header is clicked.
  await searchController.protectedGet(searchArgs({ dataset: 'Project', projectLegislation: 'default', ...options }), res);
  expect(body.code).to.equal(200);
  return body.data;
}

const total = (data) => data[0].meta[0].searchResultsTotal;

describe('Project search sorted by admin table columns (requires MongoDB)', function () {
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

  Object.entries(ORDERS).forEach(([key, { asc, desc }]) => {
    it(`orders projects by ${key} ascending`, async () => {
      expect(idsIn(await search({ sortBy: `+${key}` }))).to.deep.equal(asc.map(String));
    });

    it(`orders projects by ${key} descending`, async () => {
      expect(idsIn(await search({ sortBy: `-${key}` }))).to.deep.equal(desc.map(String));
    });
  });

  it('sorts the whole set on a joined field before cutting pages', async () => {
    const first = await search({ sortBy: '+proponent.name', pageNum: 0, pageSize: 2 });
    const second = await search({ sortBy: '+proponent.name', pageNum: 1, pageSize: 2 });

    expect([...idsIn(first), ...idsIn(second)]).to.deep.equal(ORDERS['proponent.name'].asc.map(String));
    expect(total(second)).to.equal(4);
  });

  it('keeps a tie on the same side of a page break', async () => {
    const first = await search({ sortBy: '+region', pageNum: 0, pageSize: 3 });
    const second = await search({ sortBy: '+region', pageNum: 1, pageSize: 3 });

    expect([...idsIn(first), ...idsIn(second)]).to.deep.equal(ORDERS.region.asc.map(String));
    expect(total(first)).to.equal(4);
  });

  it('returns a project whose proponent is missing without a proponent', async () => {
    const [row] = (await search({ sortBy: '+proponent.name', pageSize: 1 }))[0].searchResults;

    expect(String(row._id)).to.equal(String(X2));
    expect(row.proponent).to.equal(undefined);
    expect(row.name).to.equal('bravo');
  });

  it('shows the joined names on rows sorted by a joined field', async () => {
    const [row] = (await search({ sortBy: '-currentPhaseName', pageSize: 1 }))[0].searchResults;

    expect(row.currentPhaseName.name).to.equal('Readiness');
    expect(row.proponent.name).to.equal('Borealis');
  });

  it('cuts the page before the joins when the key needs none', async () => {
    const aggregate = sinon.spy(mongoose.model('Project'), 'aggregate');
    await search({ sortBy: '+name', pageSize: 1 });

    const page = aggregate.firstCall.args[0].find(stage => stage.$facet).$facet.searchResults;
    expect(page.findIndex(stage => stage.$limit)).to.be.greaterThan(-1).and.lessThan(page.findIndex(stage => stage.$lookup));
  });
});
