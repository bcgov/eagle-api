/**
 * Unit Tests for RecentActivity Controller - DEMI mirror
 *
 * DEMI owns Updates; eagle-api only mirrors the write. The mirror must never
 * hold up the response. Mongoose, Utils and demiPush are stubbed - no database.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const demiPush   = require('../../api/helpers/demiPush');
const defaultLog = require('winston').loggers.get('default');

const recentActivity = require('../../api/controllers/recentActivity');

describe('RecentActivity Controller - DEMI mirror', () => {
  const ACTIVITY_ID = '507f1f77bcf86cd799439044';
  const PROJECT_ID  = '507f1f77bcf86cd799439011';

  let res;
  let model;
  let saved;
  let doomed;
  let saveResult;
  let pushStub;

  function createModel() {
    function MockRecentActivity(obj) {
      Object.assign(this, obj);
      this._id = ACTIVITY_ID;
      this.save = () => saveResult();
    }
    MockRecentActivity.findOneAndUpdate = sinon.stub().callsFake(() => Promise.resolve(saved));
    MockRecentActivity.find = sinon.stub().returns({ lean: () => Promise.resolve(doomed) });
    MockRecentActivity.deleteMany = sinon.stub().resolves({ deletedCount: doomed.length });
    return MockRecentActivity;
  }

  function putArgs(active) {
    return {
      swagger: {
        params: {
          recentActivityId: { value: ACTIVITY_ID },
          RecentActivityObject: { value: { active: active, headline: 'Decision issued', type: 'News' } },
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
    saved = { _id: ACTIVITY_ID, headline: 'Decision issued', active: true };
    saveResult = () => Promise.resolve(saved);
    doomed = [{ _id: ACTIVITY_ID, project: PROJECT_ID, headline: 'Decision issued', active: true }];
    model = createModel();

    sinon.stub(mongoose, 'model').callsFake(name => (name === 'RecentActivity' ? model : {}));
    sinon.stub(Utils, 'recordAction').resolves();
    // Never settles: a handler that awaits the mirror would hang instead of answering
    pushStub = sinon.stub(demiPush, 'recentActivity').returns(new Promise(() => {}));

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  describe('protectedPost', () => {
    it('mirrors the saved Update and answers without waiting for the push', async () => {
      await recentActivity.protectedPost(postArgs(true), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('mirrors an unpublished Update too, so DEMI learns it exists', async () => {
      saved.active = false;

      await recentActivity.protectedPost(postArgs(false), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
    });

    it('does not mirror when the save fails', async () => {
      saveResult = () => Promise.reject(new Error('mongo down'));

      await recentActivity.protectedPost(postArgs(true), res);

      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedPut', () => {
    it('mirrors the updated Update and answers without waiting for the push', async () => {
      await recentActivity.protectedPut(putArgs(true), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('mirrors an unpublish so DEMI takes the Update down', async () => {
      saved.active = false;

      await recentActivity.protectedPut(putArgs(false), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
    });

    it('does not mirror when the update fails', async () => {
      model.findOneAndUpdate = sinon.stub().rejects(new Error('mongo down'));

      await recentActivity.protectedPut(putArgs(true), res);

      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedDelete', () => {
    it('mirrors every deleted Update as inactive and answers without waiting', async () => {
      doomed = [
        { _id: ACTIVITY_ID, headline: 'A', active: true },
        { _id: PROJECT_ID, headline: 'B', active: false }
      ];
      model = createModel();

      await recentActivity.protectedDelete(deleteArgs(), res);

      expect(model.deleteMany.calledOnce).to.be.true;
      expect(pushStub.args).to.deep.equal([
        [{ _id: ACTIVITY_ID, headline: 'A', active: false }],
        [{ _id: PROJECT_ID, headline: 'B', active: false }]
      ]);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('refuses to delete the whole collection', async () => {
      const args = deleteArgs();
      delete args.swagger.params.recentActivityId;

      await recentActivity.protectedDelete(args, res);

      expect(model.deleteMany.called).to.be.false;
      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });
});
