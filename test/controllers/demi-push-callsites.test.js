/**
 * Every write handler that mirrors to DEMI: the push fires on the 200 path, not on failure.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const fs = require('fs');
const winston = require('winston');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const demiPush = require('../../api/helpers/demiPush');
const documentController = require('../../api/controllers/document');
const projectController = require('../../api/controllers/project');
const recentActivityController = require('../../api/controllers/recentActivity');
const pinsController = require('../../api/controllers/pins');
const commentPeriodController = require('../../api/controllers/commentperiod');
const commentController = require('../../api/controllers/comment');
const organizationController = require('../../api/controllers/organization');
const projectNotificationController = require('../../api/controllers/projectNotification');
const userController = require('../../api/controllers/user');
const projectGroupController = require('../../api/controllers/projectGroup');
const inspectionController = require('../../api/controllers/inspection');

const {
  OID, upfile, stubModel, setEnv,
  docArgs, projArgs, pinArgs, raArgs, cpArgs, commentArgs, orgArgs, pnArgs, userArgs, groupArgs, inspArgs, itemArgs
} = require('../support/demiPushHarness');

describe('DEMI push call sites', () => {
  let res, saved, models;

  const model = modelName => stubModel(modelName, () => saved);
  // updateOne returns no document, so the handler hands demiPush an id-only snapshot to re-read.
  const expectPushedById = push => {
    expect(push.calledOnce).to.be.true;
    expect(String(push.firstCall.args[0]._id)).to.equal(OID);
    expect(Object.keys(push.firstCall.args[0])).to.deep.equal(['_id']);
  };

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    saved = { _id: OID, name: 'saved' };
    models = {};
    ['Document', 'Project', 'Comment', 'List', 'RecentActivity',
      'CommentPeriod', 'Organization', 'ProjectNotification', 'User'].forEach(n => { models[n] = model(n); });

    sinon.stub(mongoose, 'model').callsFake(name => models[name] || model(name));
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(Actions, 'publish').resolves(saved);
    sinon.stub(Actions, 'unPublish').resolves(saved);
    sinon.stub(MinioController, 'putDocument').resolves({ path: 'minio/a.pdf', extension: 'pdf' });
    sinon.stub(MinioController, 'deleteDocument').resolves();
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'unlinkSync');
    sinon.stub(demiPush, 'document').resolves();
    sinon.stub(demiPush, 'project').resolves();
    sinon.stub(demiPush, 'recentActivity').resolves();
    sinon.stub(demiPush, 'commentPeriod').resolves();
    sinon.stub(demiPush, 'comment').resolves();
    sinon.stub(demiPush, 'organization').resolves();
    sinon.stub(demiPush, 'projectNotification').resolves();
  });

  afterEach(() => sinon.restore());

  [
    ['document', documentController, 'unProtectedPost', docArgs],
    ['document', documentController, 'protectedPost', docArgs],
    ['document', documentController, 'protectedPut', docArgs],
    ['document', documentController, 'protectedPublish', docArgs],
    ['document', documentController, 'protectedUnPublish', docArgs],
    ['document', documentController, 'featureDocument', docArgs],
    ['document', documentController, 'unfeatureDocument', docArgs],
    ['project', projectController, 'protectedPost', projArgs],
    ['project', projectController, 'protectedPut', projArgs],
    ['project', projectController, 'protectedPublish', projArgs],
    ['project', projectController, 'protectedUnPublish', projArgs],
    ['recentActivity', recentActivityController, 'protectedPost', raArgs],
    ['recentActivity', recentActivityController, 'protectedPut', raArgs],
    ['commentPeriod', commentPeriodController, 'protectedPost', cpArgs],
    ['commentPeriod', commentPeriodController, 'protectedPublish', cpArgs],
    ['commentPeriod', commentPeriodController, 'protectedUnPublish', cpArgs],
    ['comment', commentController, 'protectedPost', commentArgs],
    ['comment', commentController, 'unProtectedPost', commentArgs],
    ['organization', organizationController, 'protectedPost', orgArgs],
    ['organization', organizationController, 'protectedPut', orgArgs],
    ['organization', organizationController, 'protectedPublish', orgArgs],
    ['organization', organizationController, 'protectedUnPublish', orgArgs],
    ['projectNotification', projectNotificationController, 'protectedPut', pnArgs]
  ].forEach(([kind, ctrl, handler, args]) => {
    it(`${kind}.${handler} pushes the saved ${kind} to DEMI and returns 200`, async () => {
      await ctrl[handler](args(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush[kind].calledOnceWithExactly(saved)).to.be.true;
    });
  });

  it('project.protectedUnPublish records action Unpublish on Project (was Put/Unpublish, invisible to the who-published report)', async () => {
    await projectController.protectedUnPublish(projArgs(), res);

    expect(Utils.recordAction.calledWith('Unpublish', 'Project')).to.be.true;
    expect(Utils.recordAction.calledWith('Put')).to.be.false;
  });

  it('document.protectedPut does not push when the update finds nothing', async () => {
    models.Document.findOneAndUpdate.resolves(null);

    await documentController.protectedPut(docArgs(), res);

    expect(res.status.calledWith(404)).to.be.true;
    expect(demiPush.document.called).to.be.false;
  });

  it('recentActivity.protectedDelete archives the Update and mirrors the archived row', async () => {
    await recentActivityController.protectedDelete(raArgs(), res);

    expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
    expect(models.RecentActivity.deleteMany.called).to.be.false;
    expect(demiPush.recentActivity.calledOnceWithExactly(saved)).to.be.true;
  });

  describe('pins handlers', () => {
    it('pins.protectedAddPins pushes the updated project to DEMI and returns 200', async () => {
      await pinsController.protectedAddPins(pinArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.project.calledOnceWithExactly(saved)).to.be.true;
    });

    it('pins.protectedAddPins does not push when the project is missing', async () => {
      models.Project.findOneAndUpdate.resolves(null);

      await pinsController.protectedAddPins(pinArgs(), res);

      expect(res.status.calledWith(404)).to.be.true;
      expect(demiPush.project.called).to.be.false;
    });

    ['protectedPublishPin', 'protectedUnPublishPin', 'protectedPinDelete'].forEach(handler => {
      it(`pins.${handler} pushes the project by id for demiPush to re-read and returns 200`, async () => {
        models.Project.findOne.resolves({ _id: OID, pins: [OID] });
        models.Project.updateOne.resolves({ matchedCount: 1 });

        await pinsController[handler](pinArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expectPushedById(demiPush.project);
      });
    });

    ['protectedPublishPin', 'protectedUnPublishPin'].forEach(handler => {
      it(`pins.${handler} does not push when the project has no pins`, async () => {
        models.Project.findOne.resolves(null);

        await pinsController[handler](pinArgs(), res);

        expect(res.status.calledWith(404)).to.be.true;
        expect(demiPush.project.called).to.be.false;
      });
    });
  });

  describe('public read mirrors', () => {

    it('projectNotification.protectedPost pushes the saved notification and returns 201', async () => {
      await projectNotificationController.protectedPost(pnArgs(), res);

      expect(res.status.args, `expected 201, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[201]]);
      expect(demiPush.projectNotification.calledOnceWithExactly(saved)).to.be.true;
    });

    it('commentPeriod.protectedPut pushes the period by id for demiPush to re-read', async () => {
      models.CommentPeriod.updateOne.resolves({ matchedCount: 1 });

      await commentPeriodController.protectedPut(cpArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expectPushedById(demiPush.commentPeriod);
    });

    it('document.protectedDelete pushes the deleted document flagged isDeleted', async () => {
      const gone = { _id: OID, project: OID, internalURL: 'p/a.pdf' };
      models.Document.findOneAndDelete.resolves(gone);

      await documentController.protectedDelete(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.document.calledOnceWithExactly(gone, { isDeleted: true })).to.be.true;
    });

    // The stub carries no delete body to keep, so the failure is only logged; demi-push-await covers the tombstone.
    it('document.protectedDelete answers 200 with mirrored false and logs the lost delete when the DEMI push rejects', async () => {
      const rejected = Object.assign(Promise.reject(new Error('demi unreachable')), { kind: 'documents', id: OID });
      rejected.catch(() => {});
      demiPush.document.returns(rejected);
      models.Document.findOneAndDelete.resolves({ _id: OID, project: OID });
      models.Document.updateOne.resolves({ matchedCount: 0 });
      const error = sinon.stub(winston.loggers.get('default'), 'error');

      await documentController.protectedDelete(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.deep.equal({ mirrored: false });
      expect(error.calledWithMatch(/row gone/)).to.be.true;
    });

    it('document.protectedDelete pushes before Minio, so a storage failure still reaches DEMI', async () => {
      const gone = { _id: OID, project: OID };
      models.Document.findOneAndDelete.resolves(gone);
      MinioController.deleteDocument.rejects(new Error('minio down'));

      await documentController.protectedDelete(docArgs(), res);

      expect(demiPush.document.calledOnceWithExactly(gone, { isDeleted: true })).to.be.true;
    });

    it('commentPeriod.protectedDelete pushes the deleted period flagged isDeleted', async () => {
      const gone = { _id: OID, project: OID };
      models.CommentPeriod.findOneAndDelete.resolves(gone);

      await commentPeriodController.protectedDelete(cpArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.commentPeriod.calledOnceWithExactly(gone, { isDeleted: true })).to.be.true;
    });

    ['protectedPut', 'protectedStatus'].forEach(handler => {
      it(`comment.${handler} pushes the comment by id for demiPush to re-read`, async () => {
        models.Comment.updateOne.resolves({ matchedCount: 1 });

        await commentController[handler](commentArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expectPushedById(demiPush.comment);
      });
    });

    it('projectNotification.protectedPut does not push when the notification is missing', async () => {
      models.ProjectNotification.findOne.resolves(null);

      await projectNotificationController.protectedPut(pnArgs(), res);

      expect(res.status.calledWith(404)).to.be.true;
      expect(demiPush.projectNotification.called).to.be.false;
    });

    it('organization.protectedPublish does not push when the organization is missing', async () => {
      models.Organization.findOne.resolves(null);

      await organizationController.protectedPublish(orgArgs(), res);

      expect(res.status.calledWith(404)).to.be.true;
      expect(demiPush.organization.called).to.be.false;
    });
  });

  // Opt-in kinds. Each stub resolves true: the handler answers once its push lands.
  describe('opt-in kinds', () => {
    const NEW_KINDS = ['user', 'group', 'inspection', 'inspectionElement', 'inspectionItem', 'usersOfOrganization'];
    const byId = { _id: OID };
    let responded;

    // Group handlers push onto the ACL arrays a mongoose document starts with.
    function withAcl(M) {
      const Acl = function (init) { M.call(this, init); this.read = []; this.write = []; this.delete = []; };
      Object.assign(Acl, M);
      Acl.prototype = M.prototype;
      return Acl;
    }

    beforeEach(() => {
      NEW_KINDS.forEach(kind => sinon.stub(demiPush, kind).resolves(true));
      models.Group = withAcl(model('Group'));
      ['Inspection', 'InspectionElement', 'InspectionItem'].forEach(name => {
        models[name] = model(name);
        // The mobile app's id is new, so every post saves rather than handing back a stored row.
        models[name].findOne = sinon.stub().resolves(null);
        models[name].updateOne = sinon.stub().resolves({ matchedCount: 1 });
      });
      models.InspectionItem.prototype.markModified = () => {};
      models.Group.updateOne = sinon.stub().resolves({ matchedCount: 1 });
      // Inspection handlers answer from a promise chain they do not return.
      responded = new Promise(resolve => res.json.callsFake(resolve));
    });

    [
      ['user', userController, 'protectedPost', userArgs],
      ['user', userController, 'protectedPut', userArgs],
      ['group', projectGroupController, 'protectedAddGroup', groupArgs],
      ['group', projectGroupController, 'protectedGroupPut', groupArgs]
    ].forEach(([kind, ctrl, handler, args]) => {
      it(`${kind}.${handler} answers 200 once its push of the saved ${kind} lands`, async () => {
        await ctrl[handler](args(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush[kind].calledOnceWithExactly(saved)).to.be.true;
      });
    });

    it('organization.protectedPut answers 200 once its push of the renamed org\'s users lands', async () => {
      await organizationController.protectedPut(orgArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.usersOfOrganization.calledOnce).to.be.true;
      expect(String(demiPush.usersOfOrganization.firstCall.args[0])).to.equal(OID);
    });

    it('group.protectedGroupDelete pushes the deleted group flagged isDeleted', async () => {
      const gone = { _id: OID, project: OID, members: [] };
      models.Group.findOneAndDelete.resolves(gone);

      await projectGroupController.protectedGroupDelete(groupArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.group.calledOnceWithExactly(gone, { isDeleted: true })).to.be.true;
    });

    it('group.protectedGroupDelete answers 200 with mirrored false when the DEMI push rejects', async () => {
      const rejected = Object.assign(Promise.reject(new Error('demi unreachable')), { kind: 'groups', id: OID });
      rejected.catch(() => {});
      demiPush.group.returns(rejected);

      await projectGroupController.protectedGroupDelete(groupArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.deep.equal({ mirrored: false });
    });

    ['protectedAddGroupMembers', 'protectedDeleteGroupMembers'].forEach(handler => {
      it(`group.${handler} pushes the group by id for demiPush to re-read`, async () => {
        await projectGroupController[handler](groupArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush.group.calledOnceWithExactly(byId)).to.be.true;
      });

      it(`group.${handler} does not push when no group matched`, async () => {
        models.Group.updateOne.resolves({ matchedCount: 0 });

        await projectGroupController[handler](groupArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush.group.called).to.be.false;
      });
    });

    it('inspection.protectedPostInspection answers 200 once its push of the saved inspection lands', async () => {
      await inspectionController.protectedPostInspection(inspArgs(), res);
      await responded;

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.inspection.calledOnceWithExactly(saved)).to.be.true;
    });

    it('inspection.protectedPostElement pushes the saved element and its inspection by id', async () => {
      await inspectionController.protectedPostElement(inspArgs(), res);
      await responded;

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.inspectionElement.calledOnceWithExactly(saved)).to.be.true;
      expect(demiPush.inspection.calledOnceWithExactly(byId)).to.be.true;
    });

    it('inspection.protectedPostElement does not push the inspection when no inspection matched', async () => {
      models.Inspection.updateOne.resolves({ matchedCount: 0 });

      await inspectionController.protectedPostElement(inspArgs(), res);
      await responded;

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.inspectionElement.calledOnceWithExactly(saved)).to.be.true;
      expect(demiPush.inspection.called).to.be.false;
    });

    it('inspection.protectedPostElementItem does not push the element when no element matched', async () => {
      models.InspectionElement.updateOne.resolves({ matchedCount: 0 });

      await inspectionController.protectedPostElementItem(itemArgs(null), res);
      await responded;

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.inspectionItem.calledOnceWithExactly(saved)).to.be.true;
      expect(demiPush.inspectionElement.called).to.be.false;
    });

    [['text', null], ['file', upfile]].forEach(([label, file]) => {
      it(`inspection.protectedPostElementItem (${label}) pushes the saved item and its element by id`, async () => {
        await inspectionController.protectedPostElementItem(itemArgs(file), res);
        await responded;

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush.inspectionItem.calledOnceWithExactly(saved)).to.be.true;
        expect(demiPush.inspectionElement.calledOnceWithExactly(byId)).to.be.true;
      });
    });

    describe('with DEMI configured', () => {
      let restoreEnv;

      beforeEach(() => {
        restoreEnv = setEnv({ DEMI_API_BASE: 'https://demi.test', DEMI_APIM_KEY: 'test-key', DEMI_PUSH_OPT_IN_KINDS: undefined });
        demiPush.group.restore();
        demiPush.usersOfOrganization.restore();
        sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
      });

      afterEach(() => restoreEnv());

      it('group.protectedAddGroupMembers makes no Mongo read and no HTTP call for DEMI while the opt-in list is unset', async () => {
        await projectGroupController.protectedAddGroupMembers(groupArgs(), res);
        await new Promise(setImmediate);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(models.Group.findById.called).to.be.false;
        expect(global.fetch.called).to.be.false;
      });

      it('organization.protectedPut makes no User read and no HTTP call for DEMI while the opt-in list is unset', async () => {
        await organizationController.protectedPut(orgArgs(), res);
        await new Promise(setImmediate);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(models.User.find.called).to.be.false;
        expect(demiPush.user.called).to.be.false;
        expect(global.fetch.called).to.be.false;
      });

      it('organization.protectedPut pushes each user of the org by id once users is opted in', async () => {
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'users';

        await organizationController.protectedPut(orgArgs(), res);
        await new Promise(setImmediate);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        const [filter, projection] = models.User.find.firstCall.args;
        expect(String(filter.org)).to.equal(OID);
        expect(projection).to.equal('_id demiPushPending');
        expect(demiPush.user.calledOnceWith(sinon.match({ _id: OID }))).to.be.true;
      });
    });
  });

  it('project.protectedPublish does not push when the project is missing', async () => {
    models.Project.findOne.resolves(null);

    await projectController.protectedPublish(projArgs(), res);

    expect(res.status.calledWith(404)).to.be.true;
    expect(demiPush.project.called).to.be.false;
  });
});
