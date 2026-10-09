/**
 * Write handlers answer only once their DEMI push settles: 200 with the saved body and mirrored true
 * when it landed; 200 with mirrored false, and the row flagged for the sweep, when it did not.
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
const commentController = require('../../api/controllers/comment');
const commentPeriodController = require('../../api/controllers/commentperiod');
const userController = require('../../api/controllers/user');
const pinsController = require('../../api/controllers/pins');
const {
  OID, stubModel, setEnv, docArgs, projArgs, pinArgs, cpArgs, commentArgs, userArgs
} = require('../support/demiPushHarness');

const DEMI_ON = { DEMI_API_BASE: 'https://demi.test', DEMI_APIM_KEY: 'test-key', DEMI_PUSH_OPT_IN_KINDS: undefined };
const DEMI_OFF = { DEMI_API_BASE: undefined, DEMI_APIM_KEY: undefined, DEMI_PUSH_OPT_IN_KINDS: undefined };
// The reason awaitMirror gives a push that resolved false with no refusal code.
const NOT_MIRRORED_REASON = 'not mirrored (see push-dropped line)';

describe('DEMI push awaited before the reply', () => {
  let res, saved, models, error;

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    saved = { _id: OID, name: 'saved' };
    models = {};
    ['Document', 'Project', 'Comment', 'List', 'CommentPeriod', 'User'].forEach(n => { models[n] = stubModel(n, () => saved); });

    sinon.stub(mongoose, 'model').callsFake(name => models[name] || stubModel(name, () => saved));
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(Actions, 'publish').resolves(saved);
    sinon.stub(Actions, 'unPublish').resolves(saved);
    sinon.stub(MinioController, 'putDocument').resolves({ path: 'minio/a.pdf', extension: 'pdf' });
    sinon.stub(MinioController, 'deleteDocument').resolves();
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'unlinkSync');
    error = sinon.stub(winston.loggers.get('default'), 'error');
  });

  afterEach(() => sinon.restore());

  describe('with the push stubbed', () => {
    const writeResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    // A real Project row, so strict mode drops whatever the schema lacks; save hands back the same row.
    // Required here, at load time, because mongoose.model is stubbed once the specs run.
    const Project = require('../../api/helpers/models/project');
    let projectRow;

    // Pushes labelled the way demiPush labels the promises it hands back.
    const landed = route => Object.assign(Promise.resolve(true), { kind: route, id: OID });
    const notLanded = route => Object.assign(Promise.resolve(false), { kind: route, id: OID });
    const pendingSet = modelName => models[modelName].updateOne.getCalls().find(call => call.args[1] && call.args[1].$set &&
      call.args[1].$set.demiPushPending);

    beforeEach(() => {
      [['document', 'documents'], ['project', 'projects'], ['comment', 'comments'], ['commentPeriod', 'commentperiods']]
        .forEach(([kind, route]) => sinon.stub(demiPush, kind).callsFake(() => landed(route)));
      ['Document', 'Project', 'Comment'].forEach(name => models[name].updateOne.resolves({ matchedCount: 1 }));
      models.CommentPeriod.updateOne.resolves(writeResult);
      projectRow = Project.hydrate({ _id: OID, read: ['public'], tags: [['public'], ['sysadmin']] });
      projectRow.save = function () { return Promise.resolve(this); };
    });

    // Each row's last entry is the reply body the client got before `mirrored` was added to it.
    const savedBody = () => ({ _id: OID, name: 'saved' });
    [
      ['document POST', 'document', 'documents', 'Document', () => documentController.protectedPost(docArgs(), res), () => {}, savedBody],
      ['document publish', 'document', 'documents', 'Document', () => documentController.protectedPublish(docArgs(), res), () => {}, savedBody],
      ['project PUT', 'project', 'projects', 'Project', () => projectController.protectedPut(projArgs(), res), () => {}, savedBody],
      ['public comment POST', 'comment', 'comments', 'Comment', () => commentController.unProtectedPost(commentArgs(), res), () => {}, savedBody],
      ['commentperiod PUT', 'commentPeriod', 'commentperiods', 'CommentPeriod', () => commentPeriodController.protectedPut(cpArgs(), res), () => {},
        () => ({ ...writeResult })],
      ['project DELETE', 'project', 'projects', 'Project', () => projectController.protectedDelete(projArgs(), res),
        () => models.Project.findOne.resolves(projectRow), () => projectRow.toJSON()]
    ].forEach(([label, kind, route, modelName, run, setup, reply]) => {
      it(`${label} answers 200 with the saved record and mirrored true once the push lands`, async () => {
        setup();

        await run();

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(res.json.firstCall.args[0]).to.deep.equal(Object.assign(reply(), { mirrored: true }));
        expect(pendingSet(modelName)).to.be.undefined;
      });

      it(`${label} answers 200 with mirrored false and flags the row when the push does not land`, async () => {
        setup();
        // The stored row carries an older flag; the reply answers with mirrored and leaves the flag out.
        Object.assign(saved, { demiPushPending: true, demiPushFailedAt: new Date(0), demiPushError: 'timeout' });
        demiPush[kind].callsFake(() => notLanded(route));

        await run();

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(res.json.firstCall.args[0]).to.deep.equal(Object.assign(reply(), { mirrored: false }));
        const [filter, update] = pendingSet(modelName).args;
        expect(filter).to.deep.equal({ _id: OID });
        expect(update.$set).to.include({ demiPushPending: true, demiPushError: NOT_MIRRORED_REASON });
        expect(update.$set.demiPushFailedAt).to.be.instanceOf(Date);
      });

      it(`${label} logs one error naming kind, id and reason when the push does not land`, async () => {
        setup();
        demiPush[kind].callsFake(() => notLanded(route));

        await run();

        expect(error.callCount).to.equal(1);
        expect(error.firstCall.args[1]).to.deep.equal({ kind: route, id: OID, reason: NOT_MIRRORED_REASON });
      });
    });

    // A failed push must not lead to a second insert: the record and its stored file exist once.
    [
      ['document POST', 'document', 'documents', 'Document', () => documentController.protectedPost(docArgs(), res)],
      ['public comment POST', 'comment', 'comments', 'Comment', () => commentController.unProtectedPost(commentArgs(), res)]
    ].forEach(([label, kind, route, modelName, run]) => {
      it(`${label} saves once and only flags the row when the push fails`, async () => {
        const save = sinon.spy(models[modelName].prototype, 'save');
        demiPush[kind].callsFake(() => notLanded(route));

        await run();

        expect(save.callCount).to.equal(1);
        expect(models[modelName].updateOne.getCalls().map(call => Object.keys(call.args[1]))).to.deep.equal([['$set']]);
      });
    });

    it('project DELETE pushes the soft-deleted project', async () => {
      models.Project.findOne.resolves(projectRow);

      await projectController.protectedDelete(projArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(demiPush.project.calledOnce).to.be.true;
      const [pushed, extra] = demiPush.project.firstCall.args;
      expect(pushed.get('isDeleted')).to.equal(true);
      expect(pushed.get('tags')).to.deep.equal([['sysadmin']]);
      // The stored row is re-read for the body, so the marker travels in extra as well.
      expect(extra).to.deep.equal({ isDeleted: true });
    });
  });

  // demiPush itself runs here; only the network is stubbed.
  describe('with demiPush running', () => {
    let restoreEnv;

    beforeEach(() => {
      sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    });

    afterEach(() => restoreEnv());

    it('user POST answers 200 with no DEMI call while users is not opted in', async () => {
      restoreEnv = setEnv(DEMI_ON);

      await userController.protectedPost(userArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.deep.equal(saved);
      expect(global.fetch.called).to.be.false;
    });

    it('document POST answers 200 with no DEMI call while pushes are off', async () => {
      restoreEnv = setEnv(DEMI_OFF);

      await documentController.protectedPost(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.deep.equal(saved);
      expect(global.fetch.called).to.be.false;
    });

    it('commentperiod PUT answers mirrored false when the update matched but the re-read finds nothing, sending DEMI no blank row', async () => {
      restoreEnv = setEnv(DEMI_ON);
      models.CommentPeriod.db = { readyState: 1 };
      models.CommentPeriod.updateOne.resolves({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
      models.CommentPeriod.findById.resolves(null);

      await commentPeriodController.protectedPut(cpArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.deep.equal({ acknowledged: true, matchedCount: 1, modifiedCount: 1, mirrored: false });
      expect(global.fetch.called).to.be.false;
      expect(error.calledWithMatch(sinon.match.string, { kind: 'commentperiods', id: OID, reason: 'no stored row to send' })).to.be.true;
    });

    it('document POST answers mirrored true and asks Mongo to clear an older failure once DEMI took it', async () => {
      restoreEnv = setEnv(DEMI_ON);
      models.Document.db = { readyState: 1 };
      models.Document.findById.resolves({ _id: OID, demiPushPending: true, demiPushError: 'timeout' });

      await documentController.protectedPost(docArgs(), res);

      expect(res.json.firstCall.args[0].mirrored).to.equal(true);
      const [filter, update] = models.Document.updateOne.lastCall.args;
      expect(filter).to.include({ _id: OID, demiPushPending: true });
      expect(update).to.have.property('$unset');
    });

    // DEMI sync-out reads a 200 with matchedCount 0 on PUT as "Eagle lacks this record" and recreates
    // it, so a write that matched nothing must answer as it always did and push nothing.
    describe('an update that matches nothing', () => {
      const noMatch = { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

      beforeEach(() => {
        restoreEnv = setEnv(DEMI_ON);
        ['Comment', 'CommentPeriod', 'Project'].forEach(name => {
          models[name].db = { readyState: 1 };
          models[name].updateOne.resolves(noMatch);
          models[name].findById.resolves(null);
        });
        // Publish and unpublish check the project first; a 0 match there means it went in between.
        models.Project.findOne.resolves({ _id: OID, pins: [OID] });
      });

      [
        ['commentperiod PUT', () => commentPeriodController.protectedPut(cpArgs(), res)],
        ['comment PUT', () => commentController.protectedPut(commentArgs(), res)],
        ['comment status PUT', () => commentController.protectedStatus(commentArgs(), res)],
        ['pin publish', () => pinsController.protectedPublishPin(pinArgs(), res)],
        ['pin unpublish', () => pinsController.protectedUnPublishPin(pinArgs(), res)],
        ['pin DELETE', () => pinsController.protectedPinDelete(pinArgs(), res)]
      ].forEach(([label, run]) => {
        it(`${label} answers 200 with matchedCount 0 and makes no DEMI call`, async () => {
          await run();

          expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
          expect(res.json.firstCall.args[0]).to.deep.equal(noMatch);
          expect(global.fetch.called).to.be.false;
          expect(error.called).to.be.false;
        });
      });

      it('commentperiod DELETE of an unknown id answers 200 and makes no DEMI call', async () => {
        models.CommentPeriod.findOneAndDelete.resolves(null);

        await commentPeriodController.protectedDelete(cpArgs(), res);

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(res.json.firstCall.args[0]).to.deep.equal({});
        expect(global.fetch.called).to.be.false;
      });
    });
  });
});
