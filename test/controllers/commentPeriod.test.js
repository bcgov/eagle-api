/**
 * Unit Tests for CommentPeriod Controller
 * 
 * ponytail: Minimal stubbed unit tests for CommentPeriod controller to verify request logic and regression safety.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const Actions    = require('../../api/helpers/actions');
const defaultLog = require('winston').loggers.get('default');

const commentPeriod = require('../../api/controllers/commentperiod');

describe('CommentPeriod Controller', () => {
  const VALID_CP_ID   = '507f1f77bcf86cd799439011';
  const VALID_PROJ_ID = '507f1f77bcf86cd799439022';
  const VALID_MILE_ID = '507f1f77bcf86cd799439033';

  let res;
  let cpModel;
  let commentModel;

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          commentPeriodId: { value: VALID_CP_ID },
          project:         { value: VALID_PROJ_ID },
          fields:          { value: ['_schemaName', 'read', 'write'] },
          sortBy:          { value: ['-dateStarted'] },
          pageSize:        { value: 10 },
          pageNum:         { value: 0 },
          count:           { value: false },
          period:          { value: { project: VALID_PROJ_ID, milestone: VALID_MILE_ID, isPublished: true } },
          cp:              { value: { milestone: VALID_MILE_ID, isPublished: true } },
          auth_payload: {
            realm_access:        { roles: ['sysadmin'] },
            preferred_username:  'testuser'
          },
          ...paramOverrides
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub(), setHeader: sinon.stub() };

    cpModel = {
      findOne: sinon.stub(),
      updateOne: sinon.stub(),
      findOneAndDelete: sinon.stub(),
      save: sinon.stub()
    };

    commentModel = {};

    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'CommentPeriod') return cpModel;
      if (name === 'Comment') return commentModel;
      return {};
    });

    sinon.stub(Utils, 'runDataQuery');
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'buildQuery').callsFake((prop, val, q) => {
      q[prop] = val;
      return q;
    });
    sinon.stub(Utils, 'getSkipLimitParameters').returns({ skip: 0, limit: 10 });

    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => {
      r.status(code).json(data);
      return data;
    });
    sinon.stub(Actions, 'publish').resolves({ _id: VALID_CP_ID, read: ['public', 'staff'] });
    sinon.stub(Actions, 'unPublish').resolves({ _id: VALID_CP_ID, read: ['staff'] });

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  describe('protectedOptions', () => {
    it('returns 200', () => {
      commentPeriod.protectedOptions({}, res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.send.calledOnce).to.be.true;
    });
  });

  describe('publicGet', () => {
    it('queries public data successfully', async () => {
      const args = makeArgs();
      Utils.runDataQuery.resolves([{ _id: VALID_CP_ID }]);

      const result = await commentPeriod.publicGet(args, res);
      expect(Utils.runDataQuery.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
      expect(result[0]._id).to.equal(VALID_CP_ID);
    });

    it('returns 400 on error', async () => {
      const args = makeArgs();
      Utils.runDataQuery.rejects(new Error('DB Error'));

      await commentPeriod.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedHead', () => {
    it('sets total count header', async () => {
      const args = makeArgs();
      Utils.runDataQuery.resolves([{ total_items: 5 }]);

      await commentPeriod.protectedHead(args, res);
      expect(res.setHeader.calledWith('x-total-count', 5)).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedGet', () => {
    it('queries with filters and page limits', async () => {
      const args = makeArgs();
      Utils.runDataQuery.resolves([{ _id: VALID_CP_ID }]);

      await commentPeriod.protectedGet(args, res);
      expect(Utils.runDataQuery.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedPost', () => {
    it('saves a new comment period', async () => {
      const args = makeArgs();
      const mockSaved = { _id: VALID_CP_ID, read: ['public', 'staff', 'sysadmin'] };
      
      // Mock the Mongoose model constructor instantiation
      function MockCommentPeriod(obj) {
        Object.assign(this, obj);
        this.save = sinon.stub().resolves(mockSaved);
      }
      mongoose.model.restore();
      sinon.stub(mongoose, 'model').callsFake(name => {
        if (name === 'CommentPeriod') return MockCommentPeriod;
        return {};
      });

      await commentPeriod.protectedPost(args, res);
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedPut', () => {
    it('updates comment period', async () => {
      const args = makeArgs();
      cpModel.updateOne.resolves({ nModified: 1 });

      await commentPeriod.protectedPut(args, res);
      expect(cpModel.updateOne.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedDelete', () => {
    it('deletes comment period', async () => {
      const args = makeArgs();
      cpModel.findOneAndDelete.resolves({ _id: VALID_CP_ID });

      await commentPeriod.protectedDelete(args, res);
      expect(cpModel.findOneAndDelete.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedPublish / protectedUnPublish', () => {
    it('publishes comment period', async () => {
      const args = makeArgs();
      cpModel.findOne.resolves({ _id: VALID_CP_ID, read: ['staff'] });

      await commentPeriod.protectedPublish(args, res);
      expect(Actions.publish.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('unpublishes comment period', async () => {
      const args = makeArgs();
      cpModel.findOne.resolves({ _id: VALID_CP_ID, read: ['public', 'staff'] });

      await commentPeriod.protectedUnPublish(args, res);
      expect(Actions.unPublish.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });
});
