/**
 * Every write handler that mirrors to DEMI: the push fires on the 200 path, not on failure.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');
const fs = require('fs');

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

const OID = '5f4c7d1e2b3a4c5d6e7f8091';
const p = value => ({ value });
const auth = { preferred_username: 'tester', realm_access: { roles: ['sysadmin'] } };
const upfile = { size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x'), originalname: 'a.pdf' };

const NULLABLE = ['documentFileName', 'internalOriginalName', 'legislation', 'documentSource', 'displayName',
  'eaoStatus', 'publish', 'milestone', 'type', 'documentAuthor', 'documentAuthorType', 'dateUploaded',
  'datePosted', 'description', 'projectPhase', 'keywords', 'sortOrder'];

const docArgs = () => {
  const params = { docId: p(OID), project: p(OID), _comment: p(OID), upfile: p(upfile), auth_payload: auth };
  NULLABLE.forEach(k => { params[k] = p(null); });
  return { swagger: { params }, body: { documentAuthor: 'A', documentAuthorType: OID } };
};

const projArgs = () => {
  const obj = { legislationYear: 2002, name: 'X', proponent: OID, responsibleEPDId: OID, projectLeadId: OID, intake: {} };
  return { swagger: { params: { projId: p(OID), project: p(obj), ProjObject: p(obj), auth_payload: auth } } };
};

const pinArgs = () => ({
  swagger: { params: { projId: p(OID), pins: p([OID]), pinId: p(OID), auth_payload: auth } }
});

const raObj = () => ({ active: true, headline: 'Decision issued', type: 'News', project: OID });

const raArgs = () => ({
  swagger: {
    operation: { 'x-security-scopes': ['sysadmin'] },
    params: { recentActivityId: p(OID), recentActivity: p(raObj()), RecentActivityObject: p(raObj()), auth_payload: auth }
  }
});

const cpObj = () => ({ project: OID, milestone: OID, isPublished: true, openHouses: [], relatedDocuments: [] });

const cpArgs = () => ({
  swagger: { params: { commentPeriodId: p(OID), period: p(cpObj()), cp: p(cpObj()), auth_payload: auth } }
});

const commentObj = () => ({
  period: OID, documents: [], valuedComponents: [], eaoStatus: 'Published',
  author: 'Jane Public', comment: 'Body text', isAnonymous: false
});

const commentArgs = () => ({
  swagger: {
    params: {
      commentId: p(OID), comment: p(commentObj()), period: p(OID),
      status: p({ status: 'Published' }), auth_payload: auth
    }
  }
});

const orgArgs = () => ({
  swagger: { params: { orgId: p(OID), org: p({ name: 'Org', companyType: 'Proponent' }), auth_payload: auth } }
});

// publish stays false: the controller pushes onto the array it was handed, and the stub model does
// not copy it the way a mongoose schema path would.
const pnArgs = () => ({
  swagger: {
    params: {
      projectNotificationId: p(OID), projectNotification: p({ name: 'N', type: 'T' }),
      publish: p(false), auth_payload: auth
    }
  }
});

const userArgs = () => ({
  swagger: { params: { userId: p(OID), user: p({ firstName: 'Jane', orgName: 'Acme' }), auth_payload: auth } }
});

const groupArgs = () => ({
  swagger: {
    params: {
      projId: p(OID), groupId: p(OID), memberId: p(OID), group: p({ group: 'Advisory' }),
      groupObject: p({ name: 'Renamed' }), members: p([OID]), auth_payload: auth
    }
  }
});

const inspArgs = () => ({
  swagger: { params: { inspId: p(OID), inspection: p({ inspectionId: 'mobile-1', project: OID }), auth_payload: auth } }
});

const itemArgs = file => ({
  swagger: {
    params: {
      upfile: p(file), itemId: p(OID), project: p(OID), elementId: p(OID), type: p('photo'),
      timestamp: p(null), caption: p('c'), text: p('"note"'), geo: p('[1,2]'), auth_payload: auth
    }
  }
});

describe('DEMI push call sites', () => {
  let res, saved, models;

  function model(modelName) {
    const M = function (init) { Object.assign(this, init || {}); this.legislationYearList = this.legislationYearList || []; };
    M.modelName = modelName;
    M.prototype.save = () => Promise.resolve(saved);
    // dateCompleted keeps comment.unProtectedPost inside the period; read[] is what publish toggles.
    // project.protectedPublish only switches to a year the project lists and has a named block for.
    const stored = () => new M({
      _id: OID, project: OID, read: [], dateCompleted: new Date(Date.now() + 86400000),
      legislation_2002: { name: 'X', phaseHistory: '' }, currentLegislationYear: 'legislation_2002', legislationYearList: [2002]
    });
    // recentActivity.protectedPut reads the stored row with .lean() before validating the merge
    M.findOne = sinon.stub().callsFake(() => {
      const query = Promise.resolve(stored());
      query.lean = () => Promise.resolve({ ...stored() });
      return query;
    });
    M.findById = sinon.stub().callsFake(() => Promise.resolve(stored()));
    // organization.protectedPut calls .exec() on the query; pins awaits it directly
    M.findOneAndUpdate = sinon.stub().callsFake(() => {
      const query = Promise.resolve(saved);
      query.exec = () => Promise.resolve(saved);
      return query;
    });
    M.findOneAndDelete = sinon.stub().callsFake(() => Promise.resolve(stored()));
    M.updateMany = sinon.stub().resolves({});
    M.countDocuments = sinon.stub().resolves(0);
    M.updateOne = sinon.stub().resolves({});
    M.find = sinon.stub().returns({ lean: () => Promise.resolve([{ _id: OID, active: true }]) });
    M.deleteMany = sinon.stub().resolves({ deletedCount: 1 });
    return M;
  }

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
      it(`pins.${handler} pushes the re-read project to DEMI and returns 200`, async () => {
        const fresh = { _id: OID, name: 'fresh', pins: [OID] };
        models.Project.findOne.resolves({ _id: OID, pins: [OID] });
        models.Project.findById.resolves(fresh);

        await pinsController[handler](pinArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(models.Project.findById.calledOnceWith(OID)).to.be.true;
        expect(demiPush.project.calledOnceWithExactly(fresh)).to.be.true;
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
    const fresh = () => ({ _id: OID, name: 'fresh' });

    it('projectNotification.protectedPost pushes the saved notification and returns 201', async () => {
      await projectNotificationController.protectedPost(pnArgs(), res);

      expect(res.status.args, `expected 201, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[201]]);
      expect(demiPush.projectNotification.calledOnceWithExactly(saved)).to.be.true;
    });

    it('commentPeriod.protectedPut pushes the re-read period, not the write result', async () => {
      const reread = fresh();
      models.CommentPeriod.findById.resolves(reread);

      await commentPeriodController.protectedPut(cpArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(models.CommentPeriod.findById.calledOnce).to.be.true;
      expect(demiPush.commentPeriod.calledOnceWithExactly(reread)).to.be.true;
    });

    it('document.protectedDelete pushes the deleted document flagged isDeleted', async () => {
      const gone = { _id: OID, project: OID, internalURL: 'p/a.pdf' };
      models.Document.findOneAndDelete.resolves(gone);

      await documentController.protectedDelete(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.document.calledOnceWithExactly(gone, { isDeleted: true })).to.be.true;
    });

    it('document.protectedDelete still returns 200 when the DEMI push rejects', async () => {
      const rejected = Promise.reject(new Error('demi unreachable'));
      rejected.catch(() => {});
      demiPush.document.returns(rejected);
      models.Document.findOneAndDelete.resolves({ _id: OID, project: OID });

      await documentController.protectedDelete(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
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
      it(`comment.${handler} pushes the re-read comment, not the write result`, async () => {
        const reread = fresh();
        models.Comment.findById.resolves(reread);

        await commentController[handler](commentArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(models.Comment.findById.calledOnce).to.be.true;
        expect(demiPush.comment.calledOnceWithExactly(reread)).to.be.true;
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

  // A lost re-read leaves DEMI on the pre-write state. The write itself stands, so the only way to
  // notice is the log line.
  describe('re-read failures before a DEMI push', () => {
    // The DEMI route each model pushes to, which is what the push-dropped line names.
    const ROUTE = { Comment: 'comments', CommentPeriod: 'commentperiods', Project: 'projects' };
    let error;
    let originalEnv;

    // A drop is only logged when pushes are on.
    beforeEach(() => {
      originalEnv = { base: process.env.DEMI_API_BASE, key: process.env.DEMI_APIM_KEY };
      process.env.DEMI_API_BASE = 'https://demi.test';
      process.env.DEMI_APIM_KEY = 'test-key';
      error = sinon.stub(winston.loggers.get('default'), 'error');
      models.Project.findOne.resolves({ _id: OID, pins: [OID] });
    });

    afterEach(() => {
      if (originalEnv.base === undefined) { delete process.env.DEMI_API_BASE; } else { process.env.DEMI_API_BASE = originalEnv.base; }
      if (originalEnv.key === undefined) { delete process.env.DEMI_APIM_KEY; } else { process.env.DEMI_APIM_KEY = originalEnv.key; }
    });

    [
      ['comment', commentController, 'protectedPut', commentArgs, 'Comment'],
      ['comment', commentController, 'protectedStatus', commentArgs, 'Comment'],
      ['commentPeriod', commentPeriodController, 'protectedPut', cpArgs, 'CommentPeriod'],
      ['project', pinsController, 'protectedPublishPin', pinArgs, 'Project'],
      ['project', pinsController, 'protectedUnPublishPin', pinArgs, 'Project'],
      ['project', pinsController, 'protectedPinDelete', pinArgs, 'Project']
    ].forEach(([kind, ctrl, handler, args, modelName]) => {
      it(`${modelName}.${handler} logs a failed re-read, pushes nothing and still returns 200`, async () => {
        models[modelName].findById.rejects(new Error('mongo unreachable'));

        await ctrl[handler](args(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush[kind].calledOnceWithExactly(null)).to.be.true;
        expect(error.calledWithMatch(`[demiPush] push-dropped ${ROUTE[modelName]} ${OID}: failed (re-read failed)`)).to.be.true;
      });
    });

    it('comment.protectedPut logs a re-read that finds nothing', async () => {
      models.Comment.findById.resolves(null);

      await commentController.protectedPut(commentArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.comment.calledOnceWithExactly(null)).to.be.true;
      expect(error.calledWithMatch(`[demiPush] push-dropped comments ${OID}: failed (not found on re-read)`)).to.be.true;
    });
  });

  // Opt-in kinds. Each stub never settles, so a handler that waited on its push would never answer.
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
      NEW_KINDS.forEach(kind => sinon.stub(demiPush, kind).returns(new Promise(() => {})));
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
      it(`${kind}.${handler} answers 200 without waiting on its push of the saved ${kind}`, async () => {
        await ctrl[handler](args(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(demiPush[kind].calledOnceWithExactly(saved)).to.be.true;
      });
    });

    it('organization.protectedPut answers 200 without waiting on its push of the renamed org\'s users', async () => {
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

    it('group.protectedGroupDelete still returns 200 when the DEMI push rejects', async () => {
      const rejected = Promise.reject(new Error('demi unreachable'));
      rejected.catch(() => {});
      demiPush.group.returns(rejected);

      await projectGroupController.protectedGroupDelete(groupArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
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

    it('inspection.protectedPostInspection answers 200 without waiting on its push of the saved inspection', async () => {
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
      let originalEnv;

      beforeEach(() => {
        originalEnv = { base: process.env.DEMI_API_BASE, key: process.env.DEMI_APIM_KEY, optIn: process.env.DEMI_PUSH_OPT_IN_KINDS };
        process.env.DEMI_API_BASE = 'https://demi.test';
        process.env.DEMI_APIM_KEY = 'test-key';
        delete process.env.DEMI_PUSH_OPT_IN_KINDS;
        demiPush.group.restore();
        demiPush.usersOfOrganization.restore();
        sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
      });

      afterEach(() => {
        [['DEMI_API_BASE', 'base'], ['DEMI_APIM_KEY', 'key'], ['DEMI_PUSH_OPT_IN_KINDS', 'optIn']].forEach(([name, key]) => {
          if (originalEnv[key] === undefined) { delete process.env[name]; } else { process.env[name] = originalEnv[key]; }
        });
      });

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
        expect(projection).to.equal('_id');
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
