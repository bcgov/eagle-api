/**
 * Unit Tests for Pins Controller
 *
 * Covers every exported function including happy paths, invalid-input guards,
 * not-found branches, and DB error handling.  All mongoose/Utils/logger calls
 * are stubbed — no real database connection required.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const defaultLog = require('winston').loggers.get('default');

// Load once; module caching means the same object is used by the stubs below.
const pins = require('../../api/controllers/pins');

describe('Pins Controller', () => {
  const VALID_PROJ_ID = '507f1f77bcf86cd799439011';
  const VALID_PIN_ID  = '507f1f77bcf86cd799439012';

  let res;
  let projectModel;
  let orgModel;

  // Build a minimal swagger args object; supply overrides for individual params.
  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          projId:       { value: VALID_PROJ_ID },
          pinId:        { value: VALID_PIN_ID  },
          pins:         { value: [VALID_PIN_ID] },
          sortBy:       null,
          pageSize:     null,
          pageNum:      null,
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
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };

    projectModel = {
      findOne:          sinon.stub(),
      updateOne:        sinon.stub(),
      findOneAndUpdate: sinon.stub()
    };

    // projectModel.findOne returns a lean-able query by default
    projectModel.findOne.returns({ lean: sinon.stub().resolves(null) });

    // Chainable query builder for Organization.find()
    const orgFindQuery = {
      select: sinon.stub().returnsThis(),
      sort:   sinon.stub().returnsThis(),
      skip:   sinon.stub().returnsThis(),
      limit:  sinon.stub().returnsThis(),
      lean:   sinon.stub().resolves([])
    };
    orgModel = {
      find:            sinon.stub().returns(orgFindQuery),
      countDocuments:  sinon.stub().resolves(0),
      _findQuery:      orgFindQuery  // expose so individual tests can override lean()
    };

    // Intercept every mongoose.model() call inside the controller functions.
    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'Project')      return projectModel;
      if (name === 'Organization') return orgModel;
      return {};
    });

    sinon.stub(Utils, 'runDataQuery');
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'getSkipLimitParameters').returns({ skip: 0, limit: 10 });

    // Silence log output during tests; also lets us assert on error logging.
    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  // ---------------------------------------------------------------------------
  describe('protectedOptions', () => {
    it('returns 200', () => {
      const mockRes = { status: sinon.stub().returnsThis(), send: sinon.stub() };
      pins.protectedOptions({}, mockRes);
      expect(mockRes.status.calledWith(200)).to.be.true;
      expect(mockRes.send.calledOnce).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('publicPinGet', () => {
    it('returns 400 when projId is not a valid ObjectId', async () => {
      await pins.publicPinGet(makeArgs({ projId: { value: 'not-an-id' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when projId is missing', async () => {
      await pins.publicPinGet(makeArgs({ projId: null }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 empty array when project is not found', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().resolves(null) });
      await pins.publicPinGet(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.args[0][0]).to.deep.equal([{ total_items: 0 }]);
    });

    it('returns 200 empty array when project has no pins', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().resolves({ pins: [], pinsRead: ['public'] }) });
      await pins.publicPinGet(makeArgs(), res);
      expect(res.json.args[0][0]).to.deep.equal([{ total_items: 0 }]);
    });

    it('returns 200 empty array when pins not yet published (pinsRead lacks public)', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().resolves({ pins: [VALID_PIN_ID], pinsRead: [] }) });
      await pins.publicPinGet(makeArgs(), res);
      expect(res.json.args[0][0]).to.deep.equal([{ total_items: 0 }]);
    });

    it('returns 200 with org data for published pins and records Get action', async () => {
      const orgs = [{ _id: VALID_PIN_ID, name: 'TestOrg' }];
      projectModel.findOne.returns({ lean: sinon.stub().resolves({ pins: [VALID_PIN_ID], pinsRead: ['public'] }) });
      orgModel._findQuery.lean.resolves(orgs);
      orgModel.countDocuments.resolves(1);
      await pins.publicPinGet(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Get', 'Pin')).to.be.true;
    });

    it('attaches pinsRead to response[0].read on success', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().resolves({ pins: [VALID_PIN_ID], pinsRead: ['public', 'sysadmin'] }) });
      orgModel._findQuery.lean.resolves([{ _id: VALID_PIN_ID, name: 'TestOrg' }]);
      orgModel.countDocuments.resolves(1);
      await pins.publicPinGet(makeArgs(), res);
      expect(res.json.args[0][0][0].read).to.include('public');
    });

    it('returns 400 and logs error when DB throws', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().rejects(new Error('DB connection lost')) });
      await pins.publicPinGet(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedPinGet', () => {
    it('returns 200 with pins when project found', async () => {
      projectModel.findOne.returns({ lean: sinon.stub().resolves({ pins: [VALID_PIN_ID], pinsRead: ['sysadmin'] }) });
      orgModel._findQuery.lean.resolves([{ _id: VALID_PIN_ID, name: 'TestOrg' }]);
      orgModel.countDocuments.resolves(1);
      await pins.protectedPinGet(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('returns 400 for invalid projId', async () => {
      await pins.protectedPinGet(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedAddPins', () => {
    it('returns 400 when projId is not a valid ObjectId', async () => {
      await pins.protectedAddPins(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Add action on success', async () => {
      projectModel.findOneAndUpdate.resolves({ _id: VALID_PROJ_ID, pins: [VALID_PIN_ID] });
      await pins.protectedAddPins(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Add', 'Pin', 'testuser', VALID_PROJ_ID)).to.be.true;
    });

    it('returns 404 when project not found', async () => {
      projectModel.findOneAndUpdate.resolves(null);
      await pins.protectedAddPins(makeArgs(), res);
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      projectModel.findOneAndUpdate.rejects(new Error('write conflict'));
      await pins.protectedAddPins(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedPublishPin', () => {
    it('returns 400 for invalid projId', async () => {
      await pins.protectedPublishPin(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 404 when project is not found', async () => {
      projectModel.findOne.resolves(null);
      await pins.protectedPublishPin(makeArgs(), res);
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('returns 404 when project has no pins property', async () => {
      projectModel.findOne.resolves({ _id: VALID_PROJ_ID }); // no .pins
      await pins.protectedPublishPin(makeArgs(), res);
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('returns 200 and records Publish action', async () => {
      projectModel.findOne.resolves({ _id: VALID_PROJ_ID, pins: [VALID_PIN_ID] });
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await pins.protectedPublishPin(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Publish', 'PIN')).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      projectModel.findOne.rejects(new Error('timeout'));
      await pins.protectedPublishPin(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedUnPublishPin', () => {
    it('returns 400 for invalid projId', async () => {
      await pins.protectedUnPublishPin(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 404 when project is not found', async () => {
      projectModel.findOne.resolves(null);
      await pins.protectedUnPublishPin(makeArgs(), res);
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('records Unpublish — NOT Publish — action (regression guard)', async () => {
      projectModel.findOne.resolves({ _id: VALID_PROJ_ID, pins: [VALID_PIN_ID] });
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await pins.protectedUnPublishPin(makeArgs(), res);
      expect(Utils.recordAction.calledWith('Unpublish', 'PIN')).to.be.true;
      expect(Utils.recordAction.calledWith('Publish',   'PIN')).to.be.false;
    });

    it('returns 200 on success', async () => {
      projectModel.findOne.resolves({ _id: VALID_PROJ_ID, pins: [VALID_PIN_ID] });
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await pins.protectedUnPublishPin(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      projectModel.findOne.rejects(new Error('timeout'));
      await pins.protectedUnPublishPin(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedPinDelete', () => {
    it('returns 400 when pinId is not a valid ObjectId', async () => {
      await pins.protectedPinDelete(makeArgs({ pinId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Delete action on success', async () => {
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await pins.protectedPinDelete(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Delete', 'Pin', 'testuser', VALID_PIN_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws (regression: was returning 404 silently)', async () => {
      projectModel.updateOne.rejects(new Error('write failed'));
      await pins.protectedPinDelete(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });
});
