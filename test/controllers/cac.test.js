/**
 * Unit Tests for CAC (Community Advisory Committee) Controller
 *
 * Covers every exported function including happy paths, invalid-input guards,
 * not-found branches, and DB error handling.  All mongoose/Utils/Email/logger
 * calls are stubbed — no real database connection required.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const Email      = require('../../api/helpers/email');
const defaultLog = require('winston').loggers.get('default');

const cac = require('../../api/controllers/cac');

describe('CAC Controller', () => {
  const VALID_PROJ_ID   = '507f1f77bcf86cd799439011';
  const VALID_MEMBER_ID = '507f1f77bcf86cd799439044';

  let res;
  let projectModel;
  let cacUserModel;
  let cacUserSaveStub;

  // CACUser must act as a constructor AND carry static find/delete methods.
  function createMockCACUser(saveResult) {
    cacUserSaveStub = sinon.stub().resolves(
      saveResult || { _id: VALID_MEMBER_ID, email: 'test@example.com' }
    );

    function MockCACUser(obj) {
      this.email  = obj && obj.email;
      this.read   = [];
      this.write  = [];
      this._id    = new mongoose.Types.ObjectId();
      this.save   = cacUserSaveStub;
    }

    MockCACUser.findOne    = sinon.stub();
    MockCACUser.deleteOne  = sinon.stub().resolves();

    return MockCACUser;
  }

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          projId: { value: VALID_PROJ_ID },
          cac:    { value: { email: 'test@example.com', name: 'Test User' } },
          member: { value: { _id: VALID_MEMBER_ID, email: 'test@example.com' } },
          data:   { value: { cacEmail: 'cac@example.com' } },
          auth_payload: {
            realm_access:       { roles: ['sysadmin'] },
            preferred_username: 'testuser'
          },
          ...paramOverrides
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };

    projectModel = {
      updateOne:        sinon.stub(),
      findOneAndUpdate: sinon.stub()
    };

    cacUserModel = createMockCACUser();

    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'Project') return projectModel;
      if (name === 'CACUser') return cacUserModel;
      return {};
    });

    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Email, 'sendCACWelcomeEmail').resolves();

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  // ---------------------------------------------------------------------------
  describe('protectedOptions', () => {
    it('returns 200', () => {
      const mockRes = { status: sinon.stub().returnsThis(), send: sinon.stub() };
      cac.protectedOptions({}, mockRes);
      expect(mockRes.status.calledWith(200)).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('publicCACSignUp', () => {
    it('returns 400 for invalid projId', async () => {
      await cac.publicCACSignUp(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('creates a new CACUser when email not already in the list', async () => {
      cacUserModel.findOne.resolves(null);  // not found → will save
      projectModel.findOneAndUpdate.resolves(null);
      await cac.publicCACSignUp(makeArgs(), res);
      expect(cacUserSaveStub.calledOnce).to.be.true;
    });

    it('reuses existing CACUser without saving again', async () => {
      const existing = { _id: VALID_MEMBER_ID, email: 'test@example.com' };
      cacUserModel.findOne.resolves(existing);
      projectModel.findOneAndUpdate.resolves(null);
      await cac.publicCACSignUp(makeArgs(), res);
      expect(cacUserSaveStub.called).to.be.false;
    });

    it('adds sysadmin to read/write before saving new user', async () => {
      cacUserModel.findOne.resolves(null);
      let captured;
      cacUserSaveStub.callsFake(function () {
        captured = this;
        return Promise.resolve({ _id: new mongoose.Types.ObjectId(), email: this.email });
      });
      projectModel.findOneAndUpdate.resolves(null);
      await cac.publicCACSignUp(makeArgs(), res);
      expect(captured.read).to.include('sysadmin');
      expect(captured.write).to.include('sysadmin');
    });

    it('returns 200 and records Post action on success', async () => {
      const savedUser = { _id: VALID_MEMBER_ID, email: 'test@example.com' };
      cacUserModel.findOne.resolves(null);
      cacUserSaveStub.resolves(savedUser);
      projectModel.findOneAndUpdate.resolves(null);
      await cac.publicCACSignUp(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Post', 'ProjectCACMember', 'public')).to.be.true;
    });

    it('returns 500 and logs error when CACUser.findOne throws (regression: was unprotected)', async () => {
      cacUserModel.findOne.rejects(new Error('DB error'));
      await cac.publicCACSignUp(makeArgs(), res);
      expect(res.status.calledWith(500)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });

    it('returns 500 and logs error when save throws', async () => {
      cacUserModel.findOne.resolves(null);
      cacUserSaveStub.rejects(new Error('validation failed'));
      await cac.publicCACSignUp(makeArgs(), res);
      expect(res.status.calledWith(500)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('publicCACRemoveMember', () => {
    it('returns 400 for invalid projId', async () => {
      await cac.publicCACRemoveMember(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 404 when member is not found', async () => {
      cacUserModel.findOne.resolves(null);
      await cac.publicCACRemoveMember(makeArgs(), res);
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('returns 200 and records Delete action on success', async () => {
      cacUserModel.findOne.resolves({ _id: VALID_MEMBER_ID, email: 'test@example.com' });
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await cac.publicCACRemoveMember(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Delete', 'CACMemberFromProject', 'public')).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      cacUserModel.findOne.rejects(new Error('timeout'));
      await cac.publicCACRemoveMember(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });

    it('logs the member id, never the submitted address', async () => {
      cacUserModel.findOne.resolves({ _id: VALID_MEMBER_ID, email: 'test@example.com' });
      projectModel.updateOne.resolves({ modifiedCount: 1 });
      await cac.publicCACRemoveMember(makeArgs(), res);
      expect(JSON.stringify(defaultLog.info.args)).to.not.include('test@example.com');
    });

    it('logs a miss without the submitted address', async () => {
      cacUserModel.findOne.resolves(null);
      await cac.publicCACRemoveMember(makeArgs(), res);
      expect(JSON.stringify(defaultLog.info.args)).to.not.include('test@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Both routes are anonymous: a body field shaped as a query operator must not reach CACUser.
  describe('anonymous input that could steer the member query', () => {
    const handlers = {
      publicCACSignUp: cac.publicCACSignUp,
      publicCACRemoveMember: cac.publicCACRemoveMember
    };
    const badInput = {
      'an operator object as email': { cac: { value: { email: { $ne: '' } } } },
      'a regex object as email': { cac: { value: { email: { $regex: '.*' } } } },
      'an array as email': { cac: { value: { email: ['test@example.com'] } } },
      'an email that is not an address': { cac: { value: { email: 'not-an-address' } } },
      'an email over 254 characters': { cac: { value: { email: `${'a'.repeat(250)}@example.com` } } },
      'an email of exactly 255 characters': { cac: { value: { email: `${'a'.repeat(243)}@example.com` } } },
      'no email': { cac: { value: {} } },
      'a 12-character project id': { projId: { value: 'abcdefghijkl' } }
    };

    Object.entries(handlers).forEach(([name, handler]) => {
      Object.entries(badInput).forEach(([label, overrides]) => {
        it(`${name} refuses ${label} with 400 before any query`, async () => {
          await handler(makeArgs(overrides), res);

          expect(res.status.args).to.deep.equal([[400]]);
          expect(cacUserModel.findOne.called, 'CACUser queried').to.be.false;
          expect(cacUserModel.deleteOne.called, 'CACUser deleted').to.be.false;
        });
      });

      it(`${name} looks the member up by the trimmed address string`, async () => {
        cacUserModel.findOne.resolves({ _id: VALID_MEMBER_ID, email: 'test@example.com' });
        projectModel.findOneAndUpdate.resolves(null);
        projectModel.updateOne.resolves({ modifiedCount: 1 });

        await handler(makeArgs({ cac: { value: { email: '  test@example.com ' } } }), res);

        expect(res.status.args).to.deep.equal([[200]]);
        expect(cacUserModel.findOne.firstCall.args[0].email).to.equal('test@example.com');
      });

      it(`${name} accepts an email of exactly 254 characters`, async () => {
        const email = `${'a'.repeat(242)}@example.com`;
        cacUserModel.findOne.resolves({ _id: VALID_MEMBER_ID, email });
        projectModel.findOneAndUpdate.resolves(null);
        projectModel.updateOne.resolves({ modifiedCount: 1 });

        await handler(makeArgs({ cac: { value: { email } } }), res);

        expect(res.status.args).to.deep.equal([[200]]);
        expect(cacUserModel.findOne.firstCall.args[0].email).to.equal(email);
      });
    });
  });
});
