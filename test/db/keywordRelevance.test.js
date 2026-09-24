/**
 * Keyword search ranked by relevance ($text score) against a real MongoDB.
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

const { TEST_URI, id, STAFF_ONLY, PUBLIC_READ, PUBLIC_PROJECT, capture, searchArgs, idsIn } = require('./parentReadFixtures');

const KEYWORD = 'granite';
const TEXTS = {
  strong: `${KEYWORD} ${KEYWORD} ${KEYWORD}`,
  middle: `${KEYWORD} ${KEYWORD} basin notes`,
  weak: `${KEYWORD} basin survey notes and more words`
};

const HOST_PROJECT = {
  _id: PUBLIC_PROJECT,
  _schemaName: 'Project',
  read: PUBLIC_READ,
  currentLegislationYear: 'legislation_2018',
  legislation_2018: { name: 'Host' }
};

const base = (_id, _schemaName) => ({ _id, _schemaName, read: PUBLIC_READ, write: STAFF_ONLY, delete: STAFF_ONLY });

// Each dataset's shape, with the searched text in a field that dataset shows.
const DATASETS = {
  Project: (text) => ({ currentLegislationYear: 'legislation_2018', legislation_2018: { name: text } }),
  Organization: (text) => ({ name: text }),
  User: (text) => ({ firstName: text }),
  Group: (text) => ({ name: text, project: PUBLIC_PROJECT }),
  ProjectNotification: (text) => ({ name: text }),
  RecentActivity: (text) => ({ headline: text, active: true, status: 'published', dateAdded: new Date('2026-01-01') }),
  Inspection: (text) => ({ name: text }),
  InspectionElement: (text) => ({ title: text }),
  Document: (text) => ({ displayName: text, project: PUBLIC_PROJECT })
};

// Neither _id order nor insertion order matches relevance either way.
const STRONG = id('58990017d334ee001d60fe01');
const WEAK = id('58990017d334ee001d60fe02');
const MIDDLE = id('58990017d334ee001d60fe03');
const BY_RELEVANCE = [STRONG, MIDDLE, WEAK].map(String);

describe('Keyword search ranked by relevance (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
    const epic = mongoose.connection.collection('epic');
    // A collection holds one text index. One left by the app's migrations would block ours, and it
    // cannot stand in: it misses fields some datasets here search on.
    const indexes = await epic.indexes().catch(error => (error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error)));
    const otherTextIndexes = indexes.filter(index => index.key._fts === 'text' && index.name !== 'relevanceTest');
    await Promise.all(otherTextIndexes.map(index => epic.dropIndex(index.name)));
    await epic.createIndex({ '$**': 'text' }, { name: 'relevanceTest' });
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').dropIndex('relevanceTest');
    await mongoose.disconnect();
  });

  Object.entries(DATASETS).forEach(([dataset, shape]) => {
    describe(dataset, () => {
      beforeEach(async () => {
        const hostOnly = dataset === 'Project' ? [] : [HOST_PROJECT];
        await mongoose.connection.collection('epic').deleteMany({});
        await mongoose.connection.collection('epic').insertMany([
          ...hostOnly,
          { ...base(MIDDLE, dataset), ...shape(TEXTS.middle) },
          { ...base(STRONG, dataset), ...shape(TEXTS.strong) },
          { ...base(WEAK, dataset), ...shape(TEXTS.weak) }
        ]);
        sinon.stub(Utils, 'recordAction').resolves();
      });

      async function search(sortBy) {
        const { res, body } = capture();
        const projectLegislation = dataset === 'Project' ? 'default' : '';
        await searchController.protectedGet(searchArgs({ dataset, keywords: KEYWORD, sortBy, projectLegislation }), res);
        expect(body.code).to.equal(200);
        return idsIn(body.data);
      }

      it('puts the strongest match first when no sort is asked for', async () => {
        expect(await search()).to.deep.equal(BY_RELEVANCE);
      });

      it('puts the weakest match first on an ascending relevance sort', async () => {
        expect(await search('+score')).to.deep.equal([...BY_RELEVANCE].reverse());
      });
    });
  });
});
