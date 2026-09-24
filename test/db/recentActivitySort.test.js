/**
 * Sorting the admin Updates table (RecentActivity, populate=true) by project name against a real MongoDB.
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

// Project ids run opposite to name order, and 'alpha' is lower case, so neither id order nor a
// case-sensitive compare can pass for name order.
const CHARLIE = id('58990017d334ee001d60ea01');
const ALPHA = id('58990017d334ee001d60ea02');
const BRAVO = id('58990017d334ee001d60ea03');

const ON_CHARLIE = id('58990017d334ee001d60ec01');
const CORPORATE = id('58990017d334ee001d60ec02');
const ON_BRAVO = id('58990017d334ee001d60ec03');
const ON_ALPHA_1 = id('58990017d334ee001d60ec04');
const ON_ALPHA_2 = id('58990017d334ee001d60ec05');

const project = (_id, name) => ({
  _id,
  _schemaName: 'Project',
  read: PUBLIC_READ,
  currentLegislationYear: 'legislation_2018',
  legislation_2018: { name }
});

const update = (_id, projectId) => ({
  _id,
  _schemaName: 'RecentActivity',
  read: PUBLIC_READ,
  write: STAFF_ONLY,
  delete: STAFF_ONLY,
  project: projectId,
  headline: String(_id),
  type: 'News',
  active: true,
  status: 'published',
  publishDate: new Date('2026-01-01'),
  dateAdded: new Date('2026-01-01')
});

const FIXTURES = [
  project(CHARLIE, 'Charlie'),
  project(ALPHA, 'alpha'),
  project(BRAVO, 'Bravo'),
  // Inserted out of every order under test, so an ignored sort cannot pass by insertion order.
  update(ON_BRAVO, BRAVO),
  update(ON_CHARLIE, CHARLIE),
  update(CORPORATE, null),
  update(ON_ALPHA_2, ALPHA),
  update(ON_ALPHA_1, ALPHA)
];

const ASCENDING = [CORPORATE, ON_ALPHA_1, ON_ALPHA_2, ON_BRAVO, ON_CHARLIE].map(String);

async function search(sortBy, pageNum, pageSize) {
  const { res, body } = capture();
  // The query admin's Updates table sends when the Project column is clicked.
  await searchController.protectedGet(searchArgs({ dataset: 'RecentActivity', sortBy, pageNum, pageSize, projectLegislation: 'default' }), res);
  expect(body.code).to.equal(200);
  return body.data;
}

const projectNames = (data) => data[0].searchResults.filter(row => row.project).map(row => row.project.name);

describe('Update search sorted by project name (requires MongoDB)', function () {
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

  it('orders Updates by project name ascending, ignoring case', async () => {
    const data = await search('+project.name');

    expect(projectNames(data)).to.deep.equal(['alpha', 'alpha', 'Bravo', 'Charlie']);
  });

  it('orders Updates by project name descending', async () => {
    const data = await search('-project.name');

    expect(projectNames(data)).to.deep.equal(['Charlie', 'Bravo', 'alpha', 'alpha']);
  });

  it('sorts the whole set before cutting pages, breaking name ties by _id', async () => {
    const first = await search('+project.name', 0, 2);
    const second = await search('+project.name', 1, 2);

    expect([...idsIn(first), ...idsIn(second)]).to.deep.equal(ASCENDING.slice(0, 4));
    expect(second[0].meta[0].searchResultsTotal).to.equal(ASCENDING.length);
  });

  it('puts a Corporate Update (no project) first ascending and last descending', async () => {
    const ascending = idsIn(await search('+project.name'));
    const descending = idsIn(await search('-project.name'));

    expect(ascending[0]).to.equal(String(CORPORATE));
    expect(descending[descending.length - 1]).to.equal(String(CORPORATE));
  });
});
