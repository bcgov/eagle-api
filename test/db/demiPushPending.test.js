/**
 * Flagging and clearing rows whose DEMI push did not land, against a real MongoDB.
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
const Utils = require('../../api/helpers/utils');
const organizationController = require('../../api/controllers/organization');
const { sweep } = require('../../api/helpers/demiPushSweep');
const { setEnv } = require('../support/demiPushHarness');
const { TEST_URI, id } = require('./parentReadFixtures');

const DOC = id('58990017d334ee001d60fd01');
const ORG = id('58990017d334ee001d60fd02');
const BEFORE = new Date('2026-01-01T00:00:00Z');
const PENDING = { demiPushPending: true, demiPushFailedAt: BEFORE, demiPushError: 'timeout' };

const epic = () => mongoose.connection.collection('epic');
// The Audit model's collection, written by the save hooks.
const audit = () => mongoose.connection.collection('audit');
const row = (_id = DOC) => epic().findOne({ _id });
const failed = reason => ({ mirrored: false, landed: [], failures: [{ kind: 'documents', id: String(DOC), reason }] });
const pushDocument = async () => demiPush.recordOutcome(await demiPush.awaitMirror(demiPush.document(demiPush.byId(DOC))));

describe('DEMI pending-push fields (MongoDB)', () => {
  let restoreEnv;

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    restoreEnv = setEnv({ DEMI_API_BASE: 'https://demi.test', DEMI_APIM_KEY: 'test-key', DEMI_PUSH_OPT_IN_KINDS: undefined });
    await epic().deleteMany({});
    await audit().deleteMany({});
    await epic().insertOne({ _id: DOC, _schemaName: 'Document', displayName: 'a.pdf', _updatedBy: 'staff-user' });
    sinon.stub(require('winston').loggers.get('default'), 'error');
    sinon.stub(require('winston').loggers.get('default'), 'info');
    sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
  });

  afterEach(() => {
    sinon.restore();
    restoreEnv();
  });

  after(async () => {
    await epic().deleteMany({});
    await audit().deleteMany({});
    await mongoose.disconnect();
  });

  it('stores the three fields on a failed push through one internal updateOne, leaving _updatedBy alone', async () => {
    const save = sinon.spy(mongoose.Model.prototype, 'save');
    const updateOne = sinon.spy(mongoose.model('Document'), 'updateOne');

    await demiPush.recordOutcome(failed('PARENT_NOT_FOUND'));

    const stored = await row();
    expect(stored).to.include({ demiPushPending: true, demiPushError: 'PARENT_NOT_FOUND', _updatedBy: 'staff-user' });
    expect(stored.demiPushFailedAt).to.be.instanceOf(Date);
    expect(save.called).to.be.false;
    expect(updateOne.calledOnce).to.be.true;
    expect(updateOne.firstCall.args[2]).to.deep.equal({ demiPushInternal: true });
  });

  it('clears the fields once a later push lands', async () => {
    await epic().updateOne({ _id: DOC }, { $set: PENDING });

    await pushDocument();

    expect(await row()).to.not.have.any.keys('demiPushPending', 'demiPushFailedAt', 'demiPushError');
  });

  it('clears a pending row that carries no failure time', async () => {
    await epic().updateOne({ _id: DOC }, { $set: { demiPushPending: true } });

    await pushDocument();

    expect(await row()).to.not.have.property('demiPushPending');
  });

  // The failure time comes from another pod's clock, so one within 5 s of the read may be newer than it.
  describe('a failure stamped close to the read', () => {
    const NOW = new Date('2026-10-01T00:00:00Z');

    beforeEach(() => {
      sinon.useFakeTimers({ now: NOW, toFake: ['Date'] });
    });

    it('stays flagged when stamped less than 5 s before the read', async () => {
      await epic().updateOne({ _id: DOC }, { $set: Object.assign({}, PENDING, { demiPushFailedAt: new Date(NOW.getTime() - 4999) }) });

      await pushDocument();

      expect(await row()).to.include({ demiPushPending: true });
    });

    it('is cleared when stamped more than 5 s before the read', async () => {
      await epic().updateOne({ _id: DOC }, { $set: Object.assign({}, PENDING, { demiPushFailedAt: new Date(NOW.getTime() - 5001) }) });

      await pushDocument();

      expect(await row()).to.not.have.property('demiPushPending');
    });
  });

  // Only demiPush may write the three fields; a client body that reaches a write must not clear or forge them.
  describe('written from outside demiPush', () => {
    const putOrganization = async body => {
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      await organizationController.protectedPut({
        swagger: { params: { orgId: { value: String(ORG) }, org: { value: body }, auth_payload: { preferred_username: 'staff' } } }
      }, res);
      return res;
    };

    beforeEach(async () => {
      restoreEnv();
      restoreEnv = setEnv({ DEMI_API_BASE: undefined, DEMI_APIM_KEY: undefined, DEMI_PUSH_OPT_IN_KINDS: undefined });
      sinon.stub(Utils, 'recordAction').resolves();
    });

    it('organization PUT carrying demiPushPending false leaves the flag and saves the rest', async () => {
      await epic().insertOne(Object.assign({ _id: ORG, _schemaName: 'Organization', name: 'Old' }, PENDING));

      const res = await putOrganization({ name: 'New', demiPushPending: false, $unset: { demiPushError: '' } });

      expect(res.status.args).to.deep.equal([[200]]);
      expect(await row(ORG)).to.include({ name: 'New', demiPushPending: true, demiPushError: 'timeout' });
    });

    it('organization PUT carrying a failure time does not flag an unflagged row', async () => {
      await epic().insertOne({ _id: ORG, _schemaName: 'Organization', name: 'Old' });

      await putOrganization({ name: 'New', demiPushPending: true, demiPushFailedAt: BEFORE });

      expect(await row(ORG)).to.not.have.any.keys('demiPushPending', 'demiPushFailedAt', 'demiPushError');
    });

    it('save of an existing row leaves its flag', async () => {
      await epic().insertOne(Object.assign({ _id: ORG, _schemaName: 'Organization', name: 'Old' }, PENDING));
      const org = await mongoose.model('Organization').findById(ORG);
      org.set({ name: 'New', demiPushPending: false });

      await org.save();

      expect(await row(ORG)).to.include({ name: 'New', demiPushPending: true });
    });

    it('save of a new row stores none of the fields', async () => {
      const Organization = mongoose.model('Organization');

      await new Organization(Object.assign({ _id: ORG, name: 'New' }, PENDING)).save();

      expect(await row(ORG)).to.not.have.any.keys('demiPushPending', 'demiPushFailedAt', 'demiPushError');
    });

    it('an update passing demiPushInternal still writes them', async () => {
      await epic().insertOne({ _id: ORG, _schemaName: 'Organization', name: 'Old' });

      await mongoose.model('Organization').updateOne({ _id: ORG }, { $set: PENDING }, { demiPushInternal: true });

      expect(await row(ORG)).to.include({ demiPushPending: true, demiPushError: 'timeout' });
    });
  });

  it('keeps a failure flagged after the landed push read the row', async () => {
    await epic().updateOne({ _id: DOC }, { $set: PENDING });
    // Another write's push fails while this one is on the wire, holding a body DEMI now lacks.
    global.fetch.callsFake(async () => {
      await epic().updateOne({ _id: DOC }, { $set: { demiPushFailedAt: new Date(), demiPushError: 'later' } });
      return { ok: true, status: 200 };
    });

    await pushDocument();

    expect(await row()).to.include({ demiPushPending: true, demiPushError: 'later' });
  });

  it('sweep finds the flagged row and clears it when the re-push lands', async () => {
    await epic().updateOne({ _id: DOC }, { $set: PENDING });

    const summary = await sweep({ minIntervalMs: 0 });

    expect(summary.document).to.deep.equal({ found: 1, pushed: 1, failed: 0 });
    expect(await row()).to.not.have.property('demiPushPending');
  });

  it('sweep sends nothing for a row deleted after it was found, so DEMI does not get it back', async () => {
    await epic().updateOne({ _id: DOC }, { $set: PENDING });
    const push = demiPush.document;
    sinon.stub(demiPush, 'document').callsFake(snapshot => Object.assign(
      epic().deleteOne({ _id: DOC }).then(() => push(snapshot)), { kind: 'documents', id: String(DOC) }
    ));

    const summary = await sweep({ minIntervalMs: 0 });

    expect(summary.document).to.deep.equal({ found: 1, pushed: 0, failed: 1 });
    expect(global.fetch.called).to.be.false;
  });
});
