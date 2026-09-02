/**
 * Unit Tests for RecentActivity Controller - notify claim
 *
 * Covers the atomic notifiedAt claim that keeps one published Update to one
 * mailout, and the release on unpublish/delete.  Mongoose, Utils and notifyPush
 * are stubbed — no database.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const notifyPush = require('../../api/helpers/notifyPush');
const defaultLog = require('winston').loggers.get('default');

const recentActivity = require('../../api/controllers/recentActivity');

describe('RecentActivity Controller - notify', () => {
  const ACTIVITY_ID = '507f1f77bcf86cd799439044';
  const PROJECT_ID  = '507f1f77bcf86cd799439011';

  let res;
  let stored;
  let model;
  let publishedStub;
  let cancelledStub;

  // Enough of a Mongoose filter to exercise the claim: equality plus $ne.
  function matches(doc, filter) {
    return Object.keys(filter).every(key => {
      const want = filter[key];
      if (want && typeof want === 'object' && '$ne' in want) {
        return String(doc[key]) !== String(want.$ne);
      }
      if (want && typeof want === 'object' && '$in' in want) {
        return want.$in.some(v => String(v) === String(doc[key]));
      }
      return String(doc[key]) === String(want);
    });
  }

  function createModel(initial) {
    stored = Object.assign({
      _id: ACTIVITY_ID,
      project: PROJECT_ID,
      headline: 'Decision issued',
      content: '<p>Hello</p>',
      active: false,
      notifiedAt: null
    }, initial);

    function MockRecentActivity(obj) {
      Object.assign(this, obj);
      this._id = ACTIVITY_ID;
      this.save = () => {
        stored = Object.assign(stored, this, { save: undefined });
        delete stored.save;
        return Promise.resolve(Object.assign({}, stored));
      };
    }

    MockRecentActivity.findOneAndUpdate = sinon.spy((filter, update) => {
      if (!matches(stored, filter)) {
        return Promise.resolve(null);
      }
      Object.assign(stored, update.$set || update);
      return Promise.resolve(Object.assign({}, stored));
    });
    MockRecentActivity.find = sinon.stub().returns({ lean: () => Promise.resolve([Object.assign({}, stored)]) });
    MockRecentActivity.deleteMany = sinon.stub().resolves({ deletedCount: 1 });

    return MockRecentActivity;
  }

  function putArgs(active, extra) {
    return {
      swagger: {
        params: {
          recentActivityId: { value: ACTIVITY_ID },
          RecentActivityObject: { value: Object.assign({ active: active, headline: 'Decision issued', type: 'News' }, extra) },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  function postArgs(active) {
    return {
      swagger: {
        params: {
          recentActivity: { value: { active: active, headline: 'Decision issued', project: PROJECT_ID, type: 'News' } },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  function deleteArgs() {
    return {
      swagger: {
        operation: { 'x-security-scopes': ['sysadmin'] },
        params: {
          recentActivityId: { value: ACTIVITY_ID },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    model = createModel();

    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'RecentActivity') return model;
      if (name === 'Project') return { findOne: sinon.stub().returns({ lean: () => Promise.resolve({ _id: PROJECT_ID, name: 'Test Project' }) }) };
      return {};
    });

    sinon.stub(Utils, 'recordAction').resolves();
    publishedStub = sinon.stub(notifyPush, 'updatePublished').resolves(true);
    cancelledStub = sinon.stub(notifyPush, 'updateCancelled').resolves(true);

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  describe('protectedPut', () => {
    it('pushes once when two PUTs leave the same Update active', async () => {
      await recentActivity.protectedPut(putArgs(true), res);
      await recentActivity.protectedPut(putArgs(true), res);

      expect(publishedStub.calledOnce).to.be.true;
      expect(cancelledStub.called).to.be.false;
      expect(res.status.alwaysCalledWith(200)).to.be.true;

      const [update, project] = publishedStub.firstCall.args;
      expect(String(update._id)).to.equal(ACTIVITY_ID);
      expect(update.notifiedAt).to.be.a('date');
      expect(project.name).to.equal('Test Project');
    });

    it('pushes twice and cancels once across unpublish and republish', async () => {
      await recentActivity.protectedPut(putArgs(true), res);
      await recentActivity.protectedPut(putArgs(false), res);
      await recentActivity.protectedPut(putArgs(true), res);

      expect(publishedStub.callCount).to.equal(2);
      expect(cancelledStub.calledOnce).to.be.true;
      expect(stored.notifiedAt).to.be.a('date');
    });

    it('ignores a client-supplied notifiedAt on an already-notified Update', async () => {
      model = createModel({ active: true, notifiedAt: new Date() });

      await recentActivity.protectedPut(putArgs(true, { notifiedAt: null }), res);

      expect(publishedStub.called).to.be.false;
      expect(stored.notifiedAt).to.be.a('date');
    });

    it('does not cancel an Update that was never notified', async () => {
      await recentActivity.protectedPut(putArgs(false), res);

      expect(cancelledStub.called).to.be.false;
      expect(publishedStub.called).to.be.false;
    });

    it('still responds 200 when the claim blows up', async () => {
      model.findOneAndUpdate = sinon.stub();
      model.findOneAndUpdate.onFirstCall().resolves(Object.assign({}, stored, { active: true }));
      model.findOneAndUpdate.onSecondCall().rejects(new Error('mongo down'));

      await recentActivity.protectedPut(putArgs(true), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(publishedStub.called).to.be.false;
    });
  });

  // Real notifyPush over a stubbed fetch: the claim must survive a send and not a failure.
  describe('claim release on a failed push', () => {
    let fetchStub;
    let originalBase;
    let originalKey;

    const flush = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
      publishedStub.restore();
      originalBase = process.env.NOTIFY_API_BASE;
      originalKey = process.env.NOTIFY_API_KEY;
      process.env.NOTIFY_API_BASE = 'https://eagle-notify-test.example';
      process.env.NOTIFY_API_KEY = 'test-key';
      fetchStub = sinon.stub(global, 'fetch');
    });

    afterEach(() => {
      if (originalBase === undefined) { delete process.env.NOTIFY_API_BASE; } else { process.env.NOTIFY_API_BASE = originalBase; }
      if (originalKey === undefined) { delete process.env.NOTIFY_API_KEY; } else { process.env.NOTIFY_API_KEY = originalKey; }
    });

    it('releases the claim when both push attempts fail', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));

      await recentActivity.protectedPut(putArgs(true), res);
      await flush();

      expect(fetchStub.callCount).to.equal(2);
      expect(stored.notifiedAt).to.be.null;
    });

    it('keeps the claim when the push lands', async () => {
      fetchStub.resolves({ ok: true, status: 200 });

      await recentActivity.protectedPut(putArgs(true), res);
      await flush();

      expect(fetchStub.calledOnce).to.be.true;
      expect(stored.notifiedAt).to.be.a('date');
    });
  });

  describe('protectedPost', () => {
    it('claims and pushes a new active Update', async () => {
      await recentActivity.protectedPost(postArgs(true), res);

      expect(publishedStub.calledOnce).to.be.true;
      expect(stored.notifiedAt).to.be.a('date');
    });

    it('does not push a new inactive Update', async () => {
      await recentActivity.protectedPost(postArgs(false), res);

      expect(publishedStub.called).to.be.false;
      expect(stored.notifiedAt).to.be.null;
    });
  });

  describe('protectedDelete', () => {
    it('cancels a deleted active Update', async () => {
      model = createModel({ active: true, notifiedAt: new Date() });

      await recentActivity.protectedDelete(deleteArgs(), res);

      expect(model.deleteMany.calledOnce).to.be.true;
      expect(cancelledStub.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('does not cancel a deleted inactive Update', async () => {
      await recentActivity.protectedDelete(deleteArgs(), res);

      expect(cancelledStub.called).to.be.false;
    });
  });
});
