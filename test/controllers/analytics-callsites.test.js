/**
 * Every staff write handler that feeds the analytics audit trail, plus the two server-side product
 * events. The row is emitted on the 200 path with the action and target the handler actually did.
 *
 * Utils.recordAction is deliberately NOT stubbed: it is what builds the audit row now, so the assertions
 * below run through the real controller -> recordAction -> auditFromRequest path.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const fs = require('fs');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const analytics = require('../../api/helpers/analytics');
const defaultLog = require('winston').loggers.get('default');
const demiPush = require('../../api/helpers/demiPush');
const commentPeriodController = require('../../api/controllers/commentperiod');
const documentController = require('../../api/controllers/document');
const projectController = require('../../api/controllers/project');
const searchController = require('../../api/controllers/search');

const OID = '5f4c7d1e2b3a4c5d6e7f8091';
const PROJ = '5f4c7d1e2b3a4c5d6e7f8092';
const p = value => ({ value });
const auth = { sub: 'kc-1', preferred_username: 'tester', realm_access: { roles: ['sysadmin'] } };
const upfile = { size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x'), originalname: 'a.pdf' };

const NULLABLE = ['documentFileName', 'internalOriginalName', 'legislation', 'documentSource', 'displayName',
  'eaoStatus', 'publish', 'milestone', 'type', 'documentAuthor', 'documentAuthorType', 'dateUploaded',
  'datePosted', 'description', 'projectPhase', 'keywords', 'sortOrder'];

const docArgs = () => {
  const params = { docId: p(OID), project: p(PROJ), _comment: p(OID), upfile: p(upfile), auth_payload: auth };
  NULLABLE.forEach(k => { params[k] = p(null); });
  return { swagger: { params } , body: { documentAuthor: 'A', documentAuthorType: OID } };
};

const projArgs = () => {
  const obj = { legislationYear: 2002, name: 'X', proponent: OID, responsibleEPDId: OID, projectLeadId: OID, intake: {} };
  return { swagger: { params: { projId: p(OID), project: p(obj), ProjObject: p(obj), auth_payload: auth } } };
};

const cpObj = () => ({ project: PROJ, milestone: OID, isPublished: true });

const cpArgs = () => ({
  swagger: { params: { commentPeriodId: p(OID), period: p(cpObj()), cp: p(cpObj()), auth_payload: auth } }
});

const searchArgs = () => ({
  swagger: {
    params: {
      _id: p(null), keywords: p('environment'), dataset: p('Document'), project: p(PROJ),
      populate: p(false), pageNum: p(0), pageSize: p(10), projectLegislation: p('2018'),
      sortBy: p(['-dateAdded']), caseSensitive: p(false), and: p(''), or: p(''),
      categorized: p(null), fuzzy: p(false), _schemaName: p('Document'), auth_payload: auth
    }
  }
});

/** publicDownload and protectedDownload do not return their promise chain, so drain the queue. */
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

/** The single row the handler under test handed to the analytics buffer. */
const auditRow = () => {
  expect(analytics.auditEvent.callCount, 'expected exactly one audit row').to.equal(1);
  return analytics.auditEvent.firstCall.args[0];
};

describe('Analytics call sites', () => {
  let res, saved, models;

  function model() {
    const M = function (init) { Object.assign(this, init || {}); this.legislationYearList = []; };
    M.prototype.save = () => Promise.resolve(saved);
    const stored = () => new M({ _id: OID, project: PROJ, legislation_2002: { phaseHistory: '' }, currentLegislationYear: 'legislation_2002' });
    M.findOne = sinon.stub().callsFake(() => Promise.resolve(stored()));
    M.findById = sinon.stub().callsFake(() => Promise.resolve(stored()));
    M.findOneAndUpdate = sinon.stub().resolves(saved);
    M.findOneAndDelete = sinon.stub().resolves(saved);
    M.countDocuments = sinon.stub().resolves(0);
    M.updateOne = sinon.stub().resolves({ nModified: 1 });
    M.find = sinon.stub().returns({ lean: () => Promise.resolve([{ _id: OID, active: true }]) });
    M.deleteMany = sinon.stub().resolves({ deletedCount: 1 });
    M.aggregate = sinon.stub().returns({
      allowDiskUse: sinon.stub().returnsThis(),
      collation: sinon.stub().returnsThis(),
      option: sinon.stub().returnsThis(),
      exec: sinon.stub().resolves([{ searchResults: [{ _id: OID }], total_items: 1 }])
    });
    return M;
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub(), setHeader: sinon.stub() };
    saved = { _id: OID, project: PROJ, name: 'saved' };
    models = { Document: model(), Project: model(), Comment: model(), List: model(), CommentPeriod: model() };

    sinon.stub(mongoose, 'model').callsFake(name => models[name] || model());
    sinon.stub(mongoose, 'modelNames').returns(['Document', 'Project', 'Comment']);
    sinon.stub(Utils, 'filterData').callsFake((schema, data) => data);
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => { r.status(code).json(data); return data; });
    sinon.stub(Actions, 'publish').resolves(saved);
    sinon.stub(Actions, 'unPublish').resolves(saved);
    sinon.stub(Actions, 'delete').resolves(saved);
    sinon.stub(MinioController, 'putDocument').resolves({ path: 'minio/a.pdf', extension: 'pdf' });
    sinon.stub(MinioController, 'deleteDocument').resolves();
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'unlinkSync');
    sinon.stub(demiPush, 'document').resolves();
    sinon.stub(demiPush, 'project').resolves();

    sinon.stub(analytics, 'auditEvent');
    sinon.stub(analytics, 'trackEvent');

    ['info', 'debug', 'warn', 'error'].forEach(level => sinon.stub(defaultLog, level));
  });

  afterEach(() => sinon.restore());

  // Last column is the projectId the row should carry. A Project target passes none: its targetId
  // already is the project. commentPeriod.protectedPut passes none either, because the only project
  // in scope there is raw client input.
  [
    ['project', projectController, 'protectedPost', projArgs, 'Post', 'Project', undefined],
    ['project', projectController, 'protectedPut', projArgs, 'Put', 'Project', undefined],
    ['project', projectController, 'protectedDelete', projArgs, 'Delete', 'Project', undefined],
    ['project', projectController, 'protectedPublish', projArgs, 'Publish', 'Project', undefined],
    ['project', projectController, 'protectedUnPublish', projArgs, 'Unpublish', 'Project', undefined],
    ['document', documentController, 'protectedPost', docArgs, 'Post', 'Document', PROJ],
    ['document', documentController, 'protectedPut', docArgs, 'Put', 'Document', PROJ],
    ['document', documentController, 'protectedDelete', docArgs, 'Delete', 'Document', PROJ],
    ['document', documentController, 'protectedPublish', docArgs, 'Publish', 'Document', PROJ],
    ['document', documentController, 'protectedUnPublish', docArgs, 'Unpublish', 'Document', PROJ],
    ['commentPeriod', commentPeriodController, 'protectedPost', cpArgs, 'Post', 'CommentPeriod', PROJ],
    ['commentPeriod', commentPeriodController, 'protectedPut', cpArgs, 'Put', 'CommentPeriod', undefined],
    ['commentPeriod', commentPeriodController, 'protectedDelete', cpArgs, 'Delete', 'CommentPeriod', PROJ],
    ['commentPeriod', commentPeriodController, 'protectedPublish', cpArgs, 'Publish', 'CommentPeriod', PROJ],
    ['commentPeriod', commentPeriodController, 'protectedUnPublish', cpArgs, 'Unpublish', 'CommentPeriod', PROJ]
  ].forEach(([kind, ctrl, handler, args, action, targetType, projectId]) => {
    const carries = projectId ? `project ${projectId}` : 'no project';

    it(`${kind}.${handler} audits ${action} on ${targetType} with the staff actor and ${carries}`, async () => {
      await ctrl[handler](args(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      const row = auditRow();
      expect(row).to.include({
        // The table names the verb the handler performs; recordAction lowercases it on the way out.
        action: action.toLowerCase(),
        targetType: targetType,
        targetId: OID,
        actorId: 'kc-1',
        actorName: 'tester',
        actorType: 'staff'
      });
      expect(row.projectId, `projectId on the ${targetType} row`).to.equal(projectId);
    });
  });

  it('document.unProtectedPost audits nothing, so a public write cannot land as a staff row', async () => {
    await documentController.unProtectedPost(docArgs(), res);

    expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
    expect(analytics.auditEvent.called).to.be.false;
  });

  it('document.protectedGet is a read path and audits nothing', async () => {
    sinon.stub(Utils, 'runDataQuery').resolves([{ _id: OID }]);
    const args = docArgs();
    args.swagger.params.fields = p(['displayName']);

    await documentController.protectedGet(args, res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(analytics.auditEvent.called).to.be.false;
  });

  it('project.protectedPut audits nothing when the update finds no project', async () => {
    models.Project.findOneAndUpdate.resolves(null);

    await projectController.protectedPut(projArgs(), res);

    expect(res.status.calledWith(404)).to.be.true;
    expect(analytics.auditEvent.called).to.be.false;
  });

  it('document.protectedPublish audits nothing when the caller lacks the role', async () => {
    const args = docArgs();
    args.swagger.params.auth_payload = { preferred_username: 'nobody', realm_access: { roles: ['public'] } };

    await documentController.protectedPublish(args, res);

    expect(res.status.calledWith(403)).to.be.true;
    expect(analytics.auditEvent.called).to.be.false;
  });

  describe('product events', () => {
    beforeEach(() => {
      sinon.stub(Utils, 'runDataQuery').resolves([{ _id: OID, internalURL: 'p/a.pdf', documentFileName: 'a.pdf', internalExt: 'pdf' }]);
      sinon.stub(Utils, 'buildQuery').callsFake((prop, val, q) => { q[prop] = val; return q; });
      sinon.stub(Utils, 'getSkipLimitParameters').returns({ skip: 0, limit: 10 });
      sinon.stub(Utils, 'getUrlAsStream').resolves({ pipe: sinon.stub() });
      sinon.stub(MinioController, 'statObject').resolves({ size: 10, metaData: { 'content-type': 'application/pdf' } });
      sinon.stub(MinioController, 'getPresignedGETUrl').resolves('https://minio.example/a.pdf');
    });

    it('document.publicDownload tracks Document Downloaded with no user', async () => {
      documentController.publicDownload(docArgs(), res);
      await settle();

      expect(analytics.trackEvent.calledOnce).to.be.true;
      const [eventType, properties, options] = analytics.trackEvent.firstCall.args;
      expect(eventType).to.equal('Document Downloaded');
      expect(properties).to.deep.equal({ document_id: OID });
      expect(options).to.equal(undefined);
    });

    it('document.protectedDownload tracks Document Downloaded against the staff subject', async () => {
      documentController.protectedDownload(docArgs(), res);
      await settle();

      expect(analytics.trackEvent.calledOnce).to.be.true;
      const [eventType, , options] = analytics.trackEvent.firstCall.args;
      expect(eventType).to.equal('Document Downloaded');
      // The Keycloak subject, not the username: a username can be reassigned.
      expect(options).to.deep.equal({ userId: 'kc-1' });
    });

    it('search.publicGet tracks Search Executed with the keywords, dataset and project', async () => {
      Utils.runDataQuery.restore();

      await searchController.publicGet(searchArgs(), res);

      expect(analytics.trackEvent.calledOnce).to.be.true;
      const [eventType, properties] = analytics.trackEvent.firstCall.args;
      expect(eventType).to.equal('Search Executed');
      expect(properties).to.deep.equal({ dataset: 'Document', keywords: 'environment', project_id: PROJ });
    });

    it('search.publicGet tracks nothing for a browse with no keywords', async () => {
      Utils.runDataQuery.restore();
      const args = searchArgs();
      args.swagger.params.keywords = p('');

      await searchController.publicGet(args, res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(analytics.trackEvent.called).to.be.false;
    });
  });
});
