/**
 * Unit test for 20260923000000-updates-status-backfill.
 *
 * The fake db applies the $set each bulkWrite op carries to plain objects, so the assertions read
 * what the rows hold after `up`, not which calls were made.
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');

const migration = require('../../migrations/20260923000000-updates-status-backfill');

const matches = (doc, filter) => Object.keys(filter).every(key => {
  if (key === '$or') {
    return filter.$or.some(branch => matches(doc, branch));
  }
  if (filter[key] === null) {
    return doc[key] === undefined || doc[key] === null;
  }
  return doc[key] === filter[key];
});

function fakeDb(docs) {
  return {
    collection(name) {
      expect(name).to.equal('epic');
      return {
        // Hands back only the projected fields, so a field the migration reads but forgot to
        // project shows up as missing.
        find(filter, { projection }) {
          const project = doc => Object.fromEntries(Object.keys(projection).filter(key => key in doc).map(key => [key, doc[key]]));
          const rows = docs.filter(doc => matches(doc, filter)).map(project);
          return { async *[Symbol.asyncIterator]() { yield* rows; } };
        },
        async bulkWrite(ops) {
          ops.forEach(({ updateOne }) => {
            const doc = docs.find(d => d._id === updateOne.filter._id);
            Object.assign(doc, updateOne.update.$set);
          });
          return { modifiedCount: ops.length };
        },
        async findOne(filter) {
          return docs.find(doc => matches(doc, filter)) || null;
        },
        async insertOne(doc) {
          docs.push(doc);
        },
        async deleteMany(filter) {
          const names = filter.name.$in;
          for (let i = docs.length - 1; i >= 0; i--) {
            if (docs[i]._schemaName === filter._schemaName && docs[i].type === filter.type && names.includes(docs[i].name)) {
              docs.splice(i, 1);
            }
          }
        }
      };
    }
  };
}

const ADDED = new Date('2025-01-15T00:00:00Z');
const NOTIFIED = new Date('2026-09-01T00:00:00Z');

const row = (fields) => ({ _id: new mongoose.Types.ObjectId(), _schemaName: 'RecentActivity', dateAdded: ADDED, ...fields });

describe('migration 20260923000000-updates-status-backfill', () => {
  let docs;

  beforeEach(() => {
    sinon.stub(defaultLog, 'info');
    // up() adds a console transport when none is configured; keep it off the rest of the suite.
    sinon.stub(defaultLog, 'add');
    docs = [];
  });

  afterEach(() => sinon.restore());

  it('marks a live row published and a hidden one draft', async () => {
    const live = row({ active: true, read: ['sysadmin', 'staff', 'public'] });
    const inactive = row({ active: false, read: ['sysadmin', 'staff', 'public'] });
    const staffOnly = row({ active: true, read: ['sysadmin', 'staff'] });
    docs.push(live, inactive, staffOnly);

    await migration.up(fakeDb(docs));

    expect(live.status).to.equal('published');
    expect(inactive.status).to.equal('draft');
    expect(staffOnly.status).to.equal('draft');
  });

  it('takes publishDate and notifiedAt from dateAdded, so old Updates never email again', async () => {
    const live = row({ active: true, read: ['public'] });
    docs.push(live);

    await migration.up(fakeDb(docs));

    expect(live.publishDate).to.equal(ADDED);
    expect(live.notifiedAt).to.equal(ADDED);
  });

  it('falls back to the id timestamp when dateAdded is missing', async () => {
    const undated = row({ active: true, read: ['public'], dateAdded: undefined });
    docs.push(undated);

    await migration.up(fakeDb(docs));

    expect(undated.publishDate.getTime()).to.equal(undated._id.getTimestamp().getTime());
  });

  it('keeps a notifiedAt an unmigrated row already carries', async () => {
    const sent = row({ active: true, read: ['public'], notifiedAt: NOTIFIED });
    docs.push(sent);

    await migration.up(fakeDb(docs));

    expect(sent.status).to.equal('published');
    expect(sent.notifiedAt).to.equal(NOTIFIED);
  });

  it('never touches a row that has a status, so a rerun cannot mark a new Update as emailed', async () => {
    const fresh = row({ active: true, read: ['public'], status: 'published', publishDate: new Date(), notifiedAt: null });
    docs.push(fresh);

    await migration.up(fakeDb(docs));

    expect(fresh.notifiedAt).to.equal(null);
  });

  it('leaves other schemas alone', async () => {
    const project = { _id: new mongoose.Types.ObjectId(), _schemaName: 'Project', active: true, read: ['public'], dateAdded: ADDED };
    docs.push(project);

    await migration.up(fakeDb(docs));

    expect(project).to.not.have.property('status');
  });

  it('seeds the five updateCategory entries once, and down removes them', async () => {
    await migration.up(fakeDb(docs));
    await migration.up(fakeDb(docs));

    const categories = () => docs.filter(d => d._schemaName === 'List' && d.type === 'updateCategory').map(d => d.name);
    expect(categories()).to.deep.equal(['Project News', 'PN News', 'Engagement', 'Compliance', 'Corporate']);
    docs.filter(d => d.type === 'updateCategory').forEach(d => {
      expect(d).to.include({ legislation: 0 });
      expect(d.read).to.include('public');
    });

    await migration.down(fakeDb(docs));
    expect(categories()).to.be.empty;
  });
});
