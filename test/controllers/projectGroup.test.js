/**
 * Unit Tests for ProjectGroup Controller
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

const projectGroup = require('../../api/controllers/projectGroup');

describe('ProjectGroup Controller', () => {
  const VALID_PROJ_ID   = '507f1f77bcf86cd799439011';
  const VALID_GROUP_ID  = '507f1f77bcf86cd799439022';
  const VALID_MEMBER_ID = '507f1f77bcf86cd799439033';

  let res;
  let groupModel;
  let groupSaveStub;

  // MockGroup acts as both a constructor (for protectedAddGroup) and a model
  // with static methods (for the other handlers).
  function createMockGroup() {
    groupSaveStub = sinon.stub().resolves({ _id: VALID_GROUP_ID, name: 'Test Group' });

    function MockGroup(obj) {
      this.project   = obj && obj.project;
      this.name      = obj && obj.name;
      this.read      = [];
      this.write     = [];
      this.delete    = [];
      this._addedBy  = null;
      this.save      = groupSaveStub;
    }

    MockGroup.findOneAndUpdate = sinon.stub();
    MockGroup.findOneAndDelete = sinon.stub();
    MockGroup.updateOne        = sinon.stub();

    return MockGroup;
  }

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          projId:      { value: VALID_PROJ_ID   },
          groupId:     { value: VALID_GROUP_ID  },
          memberId:    { value: VALID_MEMBER_ID },
          group:       { value: { group: 'Reviewers' } },
          groupObject: { value: { name: 'Updated Name' } },
          members:     { value: [VALID_MEMBER_ID] },
          sortBy:      null,
          pageSize:    null,
          pageNum:     null,
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

    groupModel = createMockGroup();

    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'Group') return groupModel;
      return {};
    });

    sinon.stub(Utils, 'runDataQuery');
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'getSkipLimitParameters').returns({ skip: 0, limit: 10 });

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  // ---------------------------------------------------------------------------
  describe('protectedOptions', () => {
    it('returns 200', () => {
      const mockRes = { status: sinon.stub().returnsThis(), send: sinon.stub() };
      projectGroup.protectedOptions({}, mockRes);
      expect(mockRes.status.calledWith(200)).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedAddGroup', () => {
    it('returns 400 for invalid projId', async () => {
      await projectGroup.protectedAddGroup(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Add action on success', async () => {
      await projectGroup.protectedAddGroup(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Add', 'Group', 'testuser', VALID_PROJ_ID)).to.be.true;
    });

    it('adds sysadmin, staff, project-system-admin to read/write/delete', async () => {
      let capturedGroup;
      groupSaveStub.callsFake(function () {
        capturedGroup = this;
        return Promise.resolve(this);
      });
      await projectGroup.protectedAddGroup(makeArgs(), res);
      expect(capturedGroup.read).to.include('sysadmin');
      expect(capturedGroup.write).to.include('staff');
      expect(capturedGroup.delete).to.include('project-system-admin');
    });

    it('returns 400 and logs error when save throws', async () => {
      groupSaveStub.rejects(new Error('duplicate key'));
      await projectGroup.protectedAddGroup(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedGroupPut', () => {
    it('returns 400 when projId is invalid', async () => {
      await projectGroup.protectedGroupPut(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when groupId is invalid', async () => {
      await projectGroup.protectedGroupPut(makeArgs({ groupId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Put action on success', async () => {
      groupModel.findOneAndUpdate.resolves({ _id: VALID_GROUP_ID, name: 'Updated' });
      await projectGroup.protectedGroupPut(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Put', 'Group', 'testuser', VALID_GROUP_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      groupModel.findOneAndUpdate.rejects(new Error('timeout'));
      await projectGroup.protectedGroupPut(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedGroupDelete', () => {
    it('returns 400 when projId is invalid', async () => {
      await projectGroup.protectedGroupDelete(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when groupId is invalid', async () => {
      await projectGroup.protectedGroupDelete(makeArgs({ groupId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Delete action on success', async () => {
      groupModel.findOneAndDelete.resolves({ _id: VALID_GROUP_ID });
      await projectGroup.protectedGroupDelete(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Delete', 'Group', 'testuser', VALID_PROJ_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      groupModel.findOneAndDelete.rejects(new Error('write error'));
      await projectGroup.protectedGroupDelete(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedAddGroupMembers', () => {
    it('returns 400 when projectId is invalid', async () => {
      await projectGroup.protectedAddGroupMembers(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when groupId is invalid', async () => {
      await projectGroup.protectedAddGroupMembers(makeArgs({ groupId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Add action on success', async () => {
      groupModel.updateOne.resolves({ modifiedCount: 1 });
      await projectGroup.protectedAddGroupMembers(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Add', 'GroupMember', 'testuser', VALID_GROUP_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws (regression: was missing try/catch)', async () => {
      groupModel.updateOne.rejects(new Error('network error'));
      await projectGroup.protectedAddGroupMembers(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedGroupGetMembers', () => {
    it('returns 400 when groupId is missing', async () => {
      await projectGroup.protectedGroupGetMembers(makeArgs({ groupId: null }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when groupId is invalid', async () => {
      await projectGroup.protectedGroupGetMembers(makeArgs({ groupId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 empty when group is not found', async () => {
      Utils.runDataQuery.resolves([]);
      await projectGroup.protectedGroupGetMembers(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.json.args[0][0]).to.deep.equal([{ total_items: 0 }]);
    });

    it('returns 200 with user data and records Get action on success', async () => {
      const userData = [{ _id: VALID_MEMBER_ID, displayName: 'Alice', total_items: 1 }];
      Utils.runDataQuery
        .onFirstCall().resolves([{ _id: VALID_GROUP_ID, members: [VALID_MEMBER_ID] }])
        .onSecondCall().resolves(userData);
      await projectGroup.protectedGroupGetMembers(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Get', 'GroupMember', 'testuser', VALID_GROUP_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws', async () => {
      Utils.runDataQuery.rejects(new Error('query failed'));
      await projectGroup.protectedGroupGetMembers(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });

  // ---------------------------------------------------------------------------
  describe('protectedDeleteGroupMembers', () => {
    it('returns 400 when projId is invalid', async () => {
      await projectGroup.protectedDeleteGroupMembers(makeArgs({ projId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when groupId is invalid', async () => {
      await projectGroup.protectedDeleteGroupMembers(makeArgs({ groupId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 400 when memberId is invalid', async () => {
      await projectGroup.protectedDeleteGroupMembers(makeArgs({ memberId: { value: 'bad' } }), res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('returns 200 and records Delete action on success', async () => {
      groupModel.updateOne.resolves({ modifiedCount: 1 });
      await projectGroup.protectedDeleteGroupMembers(makeArgs(), res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(Utils.recordAction.calledWith('Delete', 'GroupMember', 'testuser', VALID_GROUP_ID)).to.be.true;
    });

    it('returns 400 and logs error when DB throws (regression: was returning 404 silently)', async () => {
      groupModel.updateOne.rejects(new Error('conflict'));
      await projectGroup.protectedDeleteGroupMembers(makeArgs(), res);
      expect(res.status.calledWith(400)).to.be.true;
      expect(defaultLog.error.called).to.be.true;
    });
  });
});
