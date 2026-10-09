/**
 * Write handlers answer only once their DEMI push settles: 200 with the saved body when it landed,
 * 502 not-mirrored (the Mongo write stays) when it did not.
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
  OID, NOT_MIRRORED, stubModel, setEnv, docArgs, projArgs, pinArgs, cpArgs, commentArgs, userArgs
} = require('../support/demiPushHarness');

const DEMI_ON = { DEMI_API_BASE: 'https://demi.test', DEMI_APIM_KEY: 'test-key', DEMI_PUSH_OPT_IN_KINDS: undefined };
const DEMI_OFF = { DEMI_API_BASE: undefined, DEMI_APIM_KEY: undefined, DEMI_PUSH_OPT_IN_KINDS: undefined };
// The reason awaitMirror gives a push that resolved false while its record is not parked.
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

    // A false push labelled the way demiPush labels the promises it hands back.
    const notLanded = (route) => Object.assign(Promise.resolve(false), { kind: route, id: OID });

    beforeEach(() => {
      ['document', 'project', 'comment', 'commentPeriod'].forEach(kind => sinon.stub(demiPush, kind).resolves(true));
      models.CommentPeriod.updateOne.resolves(writeResult);
      projectRow = Project.hydrate({ _id: OID, read: ['public'], tags: [['public'], ['sysadmin']] });
      projectRow.save = function () { return Promise.resolve(this); };
    });

    [
      ['document POST', 'document', 'documents', () => documentController.protectedPost(docArgs(), res), () => saved, () => {}],
      ['document publish', 'document', 'documents', () => documentController.protectedPublish(docArgs(), res), () => saved, () => {}],
      ['project PUT', 'project', 'projects', () => projectController.protectedPut(projArgs(), res), () => saved, () => {}],
      ['public comment POST', 'comment', 'comments', () => commentController.unProtectedPost(commentArgs(), res), () => saved, () => {}],
      ['commentperiod PUT', 'commentPeriod', 'commentperiods', () => commentPeriodController.protectedPut(cpArgs(), res), () => writeResult, () => {}],
      ['project DELETE', 'project', 'projects', () => projectController.protectedDelete(projArgs(), res), () => projectRow,
        () => models.Project.findOne.resolves(projectRow)]
    ].forEach(([label, kind, route, run, body, setup]) => {
      it(`${label} answers 200 with the saved body once the push lands`, async () => {
        setup();

        await run();

        expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
        expect(res.json.firstCall.args[0]).to.equal(body());
      });

      it(`${label} answers 502 not-mirrored when the push does not land`, async () => {
        setup();
        demiPush[kind].returns(notLanded(route));

        await run();

        expect(res.status.args, `expected 502, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[502]]);
        expect(res.json.firstCall.args[0]).to.deep.equal(NOT_MIRRORED);
      });

      it(`${label} logs one error naming kind, id and reason when the push does not land`, async () => {
        setup();
        demiPush[kind].returns(notLanded(route));

        await run();

        expect(error.callCount).to.equal(1);
        expect(error.firstCall.args[1]).to.deep.equal({ kind: route, id: OID, reason: NOT_MIRRORED_REASON });
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
      expect(res.json.firstCall.args[0]).to.equal(saved);
      expect(global.fetch.called).to.be.false;
    });

    it('document POST answers 200 with no DEMI call while pushes are off', async () => {
      restoreEnv = setEnv(DEMI_OFF);

      await documentController.protectedPost(docArgs(), res);

      expect(res.status.args, `expected 200, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[200]]);
      expect(res.json.firstCall.args[0]).to.equal(saved);
      expect(global.fetch.called).to.be.false;
    });

    it('commentperiod PUT answers 502 when the update matched but the re-read finds nothing, sending DEMI no blank row', async () => {
      restoreEnv = setEnv(DEMI_ON);
      models.CommentPeriod.db = { readyState: 1 };
      models.CommentPeriod.updateOne.resolves({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
      models.CommentPeriod.findById.resolves(null);

      await commentPeriodController.protectedPut(cpArgs(), res);

      expect(res.status.args, `expected 502, got ${JSON.stringify(res.status.args)}`).to.deep.equal([[502]]);
      expect(res.json.firstCall.args[0]).to.deep.equal(NOT_MIRRORED);
      expect(global.fetch.called).to.be.false;
      expect(error.calledWithMatch(sinon.match.string, { kind: 'commentperiods', id: OID, reason: NOT_MIRRORED_REASON })).to.be.true;
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
          expect(res.json.firstCall.args[0]).to.equal(noMatch);
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
