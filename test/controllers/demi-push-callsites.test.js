/**
 * Every write handler that mirrors to DEMI: the push fires on the 200 path, not on failure.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const fs = require('fs');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const demiPush = require('../../api/helpers/demiPush');
const documentController = require('../../api/controllers/document');
const projectController = require('../../api/controllers/project');
const recentActivityController = require('../../api/controllers/recentActivity');

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

const raObj = () => ({ active: true, headline: 'Decision issued', type: 'News', project: OID });

const raArgs = () => ({
  swagger: {
    operation: { 'x-security-scopes': ['sysadmin'] },
    params: { recentActivityId: p(OID), recentActivity: p(raObj()), RecentActivityObject: p(raObj()), auth_payload: auth }
  }
});

describe('DEMI push call sites', () => {
  let res, saved, models;

  function model() {
    const M = function (init) { Object.assign(this, init || {}); this.legislationYearList = []; };
    M.prototype.save = () => Promise.resolve(saved);
    const stored = () => new M({ _id: OID, project: OID, legislation_2002: { phaseHistory: '' }, currentLegislationYear: 'legislation_2002' });
    M.findOne = sinon.stub().callsFake(() => Promise.resolve(stored()));
    M.findById = sinon.stub().callsFake(() => Promise.resolve(stored()));
    M.findOneAndUpdate = sinon.stub().resolves(saved);
    M.countDocuments = sinon.stub().resolves(0);
    M.updateOne = sinon.stub().resolves({});
    M.find = sinon.stub().returns({ lean: () => Promise.resolve([{ _id: OID, active: true }]) });
    M.deleteMany = sinon.stub().resolves({ deletedCount: 1 });
    return M;
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    saved = { _id: OID, name: 'saved' };
    models = { Document: model(), Project: model(), Comment: model(), List: model(), RecentActivity: model() };

    sinon.stub(mongoose, 'model').callsFake(name => models[name] || model());
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(Actions, 'publish').resolves(saved);
    sinon.stub(Actions, 'unPublish').resolves(saved);
    sinon.stub(MinioController, 'putDocument').resolves({ path: 'minio/a.pdf', extension: 'pdf' });
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'unlinkSync');
    sinon.stub(demiPush, 'document').resolves();
    sinon.stub(demiPush, 'project').resolves();
    sinon.stub(demiPush, 'recentActivity').resolves();
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
    ['recentActivity', recentActivityController, 'protectedPut', raArgs]
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

  it('recentActivity.protectedDelete mirrors each doomed Update as inactive', async () => {
    await recentActivityController.protectedDelete(raArgs(), res);

    expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
    expect(demiPush.recentActivity.calledOnceWithExactly({ _id: OID, active: false })).to.be.true;
  });

  it('project.protectedPublish does not push when the project is missing', async () => {
    models.Project.findOne.resolves(null);

    await projectController.protectedPublish(projArgs(), res);

    expect(res.status.calledWith(404)).to.be.true;
    expect(demiPush.project.called).to.be.false;
  });
});
