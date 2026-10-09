/**
 * Keeping and resending hard deletes whose DEMI push did not land, against a real MongoDB.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const demiPush = require('../../api/helpers/demiPush');
const { sweep } = require('../../api/helpers/demiPushSweep');
const { setEnv } = require('../support/demiPushHarness');
const { TEST_URI, id } = require('./parentReadFixtures');

const DOC = id('58990017d334ee001d60fe01');
const PROJECT = id('58990017d334ee001d60fe02');
const REFUSED = { ok: false, status: 404, json: async () => ({ code: 'PARENT_NOT_FOUND' }) };

const Tombstone = () => mongoose.model('DemiPushTombstone');
const gone = () => ({ _id: DOC, _schemaName: 'Document', project: PROJECT, displayName: 'a.pdf', read: ['staff'] });
const pushDelete = async () => demiPush.recordOutcome(await demiPush.awaitMirror(demiPush.document(gone(), { isDeleted: true })));

describe('DEMI push tombstones (MongoDB)', () => {
  let restoreEnv;

  before(async () => {
    await mongoose.connect(TEST_URI);
    await Tombstone().syncIndexes();
  });

  beforeEach(async () => {
    restoreEnv = setEnv({ DEMI_API_BASE: 'https://demi.test', DEMI_APIM_KEY: 'test-key', DEMI_PUSH_OPT_IN_KINDS: undefined });
    await Tombstone().deleteMany({});
    sinon.stub(require('winston').loggers.get('default'), 'error');
    sinon.stub(require('winston').loggers.get('default'), 'info');
    sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
  });

  afterEach(() => {
    sinon.restore();
    restoreEnv();
  });

  after(async () => {
    await Tombstone().deleteMany({});
    await mongoose.disconnect();
  });

  it('allows one tombstone per kind and id', async () => {
    const row = { kind: 'documents', targetId: DOC, body: gone() };
    await Tombstone().create(row);

    let duplicate;
    try {
      await Tombstone().create(row);
    } catch (err) {
      duplicate = err;
    }

    expect(duplicate && duplicate.code).to.equal(11000);
    await Tombstone().create({ kind: 'commentperiods', targetId: DOC, body: gone() });
    expect(await Tombstone().countDocuments()).to.equal(2);
  });

  it('keeps a refused delete once, updating its failure time and reason on the next refusal', async () => {
    global.fetch.resolves(REFUSED);
    await pushDelete();
    const first = await Tombstone().findOne({ kind: 'documents', targetId: DOC }).lean();

    global.fetch.resolves({ ok: false, status: 400 });
    await pushDelete();

    const kept = await Tombstone().find({}).lean();
    expect(kept).to.have.length(1);
    expect(first.error).to.equal('PARENT_NOT_FOUND');
    expect(kept[0].error).to.equal('not mirrored (see push-dropped line)');
    expect(kept[0].failedAt.getTime()).to.be.at.least(first.failedAt.getTime());
    expect(kept[0].createdAt.getTime()).to.equal(first.createdAt.getTime());
    expect(String(kept[0].body.project)).to.equal(String(PROJECT));
  });

  it('drops the tombstone once a delete lands', async () => {
    global.fetch.resolves(REFUSED);
    await pushDelete();
    global.fetch.resolves({ ok: true, status: 200 });

    await pushDelete();

    expect(await Tombstone().countDocuments()).to.equal(0);
  });

  it('sweep resends the kept delete and drops the tombstone when DEMI takes it', async () => {
    global.fetch.resolves(REFUSED);
    await pushDelete();
    global.fetch.resetHistory();
    global.fetch.resolves({ ok: true, status: 200 });

    const summary = await sweep({ minIntervalMs: 0 });

    expect(summary.tombstones).to.deep.equal({ found: 1, pushed: 1, failed: 0 });
    const [url, init] = global.fetch.firstCall.args;
    expect(url).to.match(new RegExp(`/eagle/documents/${DOC}$`));
    expect(JSON.parse(init.body).doc).to.include({ _id: String(DOC), project: String(PROJECT), isDeleted: true });
    expect(await Tombstone().countDocuments()).to.equal(0);
  });

  it('sweep keeps the tombstone when the resend is refused again', async () => {
    global.fetch.resolves(REFUSED);
    await pushDelete();

    const summary = await sweep({ minIntervalMs: 0 });

    expect(summary.tombstones).to.deep.equal({ found: 1, pushed: 0, failed: 1 });
    expect(await Tombstone().countDocuments({ kind: 'documents', targetId: DOC, error: 'PARENT_NOT_FOUND' })).to.equal(1);
  });
});
