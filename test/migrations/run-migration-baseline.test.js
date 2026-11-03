const { expect } = require('chai');
const sinon = require('sinon');

const { baselineFreshDb } = require('../../run_migration');

const FILE_NAMES = [
  '20190109233701-centroidCreation.js',
  '20251231235959-lastOf2025.js',
  '20260101000000-firstOf2026.js',
  '20260813000000-seed-config.js',
  'README.md'
];

// Stores what the baseline writes so each test can read back the changelog rows and indexes.
function fakeDb(collections) {
  const indexes = [];
  return {
    indexes,
    collection(name) {
      collections[name] = collections[name] || [];
      const docs = collections[name];
      return {
        async countDocuments() { return docs.length; },
        async insertMany(rows) { docs.push(...rows); },
        async createIndex(key, options) { indexes.push({ collection: name, key, name: options.name }); }
      };
    }
  };
}

describe('run_migration baselineFreshDb', () => {
  beforeEach(() => sinon.stub(console, 'log'));
  afterEach(() => sinon.restore());

  it('marks only pre-2026 migrations applied on a fresh database', async () => {
    const collections = {};

    await baselineFreshDb(fakeDb(collections), FILE_NAMES);

    expect(collections.changelog.map(row => row.fileName)).to.deep.equal([
      '20190109233701-centroidCreation.js',
      '20251231235959-lastOf2025.js'
    ]);
  });

  it('creates the wildcard text index on epic on a fresh database', async () => {
    const db = fakeDb({});

    await baselineFreshDb(db, FILE_NAMES);

    expect(db.indexes).to.deep.equal([{ collection: 'epic', key: { '$**': 'text' }, name: 'localBaselineText' }]);
  });

  it('does nothing when epic already holds documents', async () => {
    const collections = { epic: [{ _schemaName: 'Project' }] };
    const db = fakeDb(collections);

    await baselineFreshDb(db, FILE_NAMES);

    expect(collections.changelog).to.be.empty;
    expect(db.indexes).to.be.empty;
  });

  it('does nothing when the changelog already has rows', async () => {
    const collections = { changelog: [{ fileName: '20260923000000-updates-status-backfill.js' }] };
    const db = fakeDb(collections);

    await baselineFreshDb(db, FILE_NAMES);

    expect(collections.changelog).to.have.lengthOf(1);
    expect(db.indexes).to.be.empty;
  });
});
