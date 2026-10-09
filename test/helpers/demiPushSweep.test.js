const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');

const demiPush = require('../../api/helpers/demiPush');
const { sweep } = require('../../api/helpers/demiPushSweep');
const { KINDS } = require('../../api/helpers/demiPushKinds');
const { setEnv } = require('../support/demiPushHarness');

const PROJECT = '5f4c7d1e2b3a4c5d6e7f00a1';
const DOCUMENT = '5f4c7d1e2b3a4c5d6e7f00d1';
const SECOND_DOCUMENT = '5f4c7d1e2b3a4c5d6e7f00d2';
const READ_AT = new Date('2026-10-02T00:00:00Z');
const FAILED_AT = new Date('2026-10-01T00:00:00Z');

// Each child kind and the kinds DEMI files it under (eagle-demi src/helpers/parent-admit.js callers).
const PARENTS = {
  document: ['project', 'projectNotification'],
  commentPeriod: ['project', 'projectNotification'],
  recentActivity: ['project', 'projectNotification'],
  group: ['project', 'projectNotification'],
  inspection: ['project'],
  inspectionElement: ['inspection'],
  inspectionItem: ['inspectionElement'],
  comment: ['commentPeriod']
};

describe('demiPushSweep', () => {
  let models, restoreEnv;

  // A model whose pending-row query hands back `rows` and whose updates match one row.
  const pendingModel = rows => {
    const query = {
      sort: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      lean: sinon.stub().resolves(rows)
    };
    return { query, find: sinon.stub().returns(query), updateOne: sinon.stub().resolves({ matchedCount: 1 }) };
  };
  // Labelled the way demiPush labels a push of a row that was flagged when it read it.
  const labelled = (value, route, id) => Object.assign(Promise.resolve(value), {
    kind: route, id, outcome: { reason: value ? null : 'PARENT_NOT_FOUND', readAt: READ_AT, pending: true }
  });
  const update = (model, op) => model.updateOne.getCalls().map(call => call.args).find(([, change]) => change[op]);
  // Pacing is asserted on its own below; elsewhere it would only slow the run.
  const run = options => sweep(Object.assign({ minIntervalMs: 0 }, options));

  beforeEach(() => {
    restoreEnv = setEnv({ DEMI_PUSH_OPT_IN_KINDS: undefined });
    models = {
      Project: pendingModel([{ _id: PROJECT }]),
      Document: pendingModel([{ _id: DOCUMENT }])
    };
    sinon.stub(mongoose, 'model').callsFake(name => models[name] || pendingModel([]));
    sinon.stub(demiPush, 'configured').returns(true);
    sinon.stub(demiPush, 'project').callsFake(row => labelled(true, 'projects', String(row._id)));
    sinon.stub(demiPush, 'document').callsFake(row => labelled(false, 'documents', String(row._id)));
    sinon.stub(winston.loggers.get('default'), 'error');
    sinon.stub(winston.loggers.get('default'), 'info');
  });

  afterEach(() => {
    sinon.restore();
    restoreEnv();
  });

  it('clears the pending fields flagged before the re-push read the row', async () => {
    await run();

    const [filter, change] = update(models.Project, '$unset');
    expect(filter).to.deep.equal({
      _id: PROJECT,
      demiPushPending: true,
      $or: [{ demiPushFailedAt: { $lt: new Date(READ_AT.getTime() - 5000) } }, { demiPushFailedAt: { $exists: false } }]
    });
    expect(change.$unset).to.have.all.keys('demiPushPending', 'demiPushFailedAt', 'demiPushError');
  });

  it('keeps a row pending with a newer failure time and reason when its re-push fails again', async () => {
    await run();

    const [filter, change] = update(models.Document, '$set');
    expect(filter).to.deep.equal({ _id: DOCUMENT });
    expect(change.$set).to.include({ demiPushPending: true, demiPushError: 'PARENT_NOT_FOUND' });
    expect(change.$set.demiPushFailedAt.getTime()).to.be.greaterThan(FAILED_AT.getTime());
  });

  it('returns found, pushed and failed per kind', async () => {
    const summary = await run();

    expect(summary.project).to.deep.equal({ found: 1, pushed: 1, failed: 0 });
    expect(summary.document).to.deep.equal({ found: 1, pushed: 0, failed: 1 });
  });

  it('re-pushes projects before documents', async () => {
    await run();

    expect(demiPush.project.calledBefore(demiPush.document)).to.be.true;
  });

  it('reads only the ids of pending rows of the kind, oldest failure first, up to the limit', async () => {
    await run({ limitPerKind: 7 });

    expect(models.Document.find.firstCall.args[0]).to.deep.equal({ _schemaName: 'Document', demiPushPending: true });
    expect(models.Document.query.sort.firstCall.args[0]).to.deep.equal({ demiPushFailedAt: 1 });
    expect(models.Document.query.limit.firstCall.args[0]).to.equal(7);
    expect(models.Document.query.select.firstCall.args[0]).to.equal('_id');
  });

  it('starts the next push only once the one before it has settled', async () => {
    models.Document = pendingModel([{ _id: DOCUMENT }, { _id: SECOND_DOCUMENT }]);
    let settleFirst;
    demiPush.document.onFirstCall().callsFake(row => Object.assign(new Promise(resolve => { settleFirst = resolve; }), {
      kind: 'documents', id: String(row._id), outcome: { reason: null }
    }));

    const pending = run();
    await new Promise(setImmediate);
    expect(demiPush.document.callCount).to.equal(1);

    settleFirst(true);
    await pending;
    expect(demiPush.document.callCount).to.equal(2);
  });

  it('waits minIntervalMs between the starts of two pushes', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    const pending = sweep({ minIntervalMs: 400 });

    await clock.tickAsync(399);
    expect(demiPush.document.called).to.be.false;

    await clock.tickAsync(1);
    await pending;
    expect(demiPush.document.calledOnce).to.be.true;
  });

  it('skips an opt-in kind that is not turned on', async () => {
    const summary = await run();

    expect(summary).to.not.have.property('user');
    expect(mongoose.model.calledWith('User')).to.be.false;
  });

  it('sweeps an opt-in kind once DEMI_PUSH_OPT_IN_KINDS names it', async () => {
    process.env.DEMI_PUSH_OPT_IN_KINDS = 'users';

    const summary = await run();

    expect(summary.user).to.deep.equal({ found: 0, pushed: 0, failed: 0 });
  });

  it('does nothing while pushes are off', async () => {
    demiPush.configured.returns(false);

    expect(await run()).to.deep.equal({});
    expect(mongoose.model.called).to.be.false;
  });

  it('marks a kind it could not read and goes on to the next', async () => {
    models.Project.query.lean.rejects(new Error('mongo down'));

    const summary = await run();

    expect(summary.project).to.deep.equal({ found: 0, pushed: 0, failed: 0, unreadable: true });
    expect(summary.document.found).to.equal(1);
  });

  it('counts a row whose push throws as failed and does not reject', async () => {
    demiPush.project.throws(new Error('bad row'));

    const summary = await run();

    expect(summary.project).to.deep.equal({ found: 1, pushed: 0, failed: 1 });
  });

  describe('failed hard deletes', () => {
    const GONE = '5f4c7d1e2b3a4c5d6e7f00d9';
    const body = { _id: GONE, project: PROJECT, read: ['staff'] };
    // Labelled the way demiPush labels a delete push.
    const deletePush = landed => (row, extra) => Object.assign(Promise.resolve(landed), {
      kind: 'documents', id: String(row._id),
      outcome: { reason: landed ? null : 'PARENT_NOT_FOUND', deletedDoc: extra && extra.isDeleted ? row : null }
    });
    // Tombstones only for documents; every other kind reads none.
    const tombstoneModel = rows => {
      const model = pendingModel(rows);
      const none = pendingModel([]).query;
      model.find.callsFake(filter => (filter.kind === 'documents' ? model.query : none));
      model.deleteOne = sinon.stub().resolves({ deletedCount: 1 });
      return model;
    };

    beforeEach(() => {
      models.Document = pendingModel([]);
      models.Document.updateOne.resolves({ matchedCount: 0 });
      models.DemiPushTombstone = tombstoneModel([{ kind: 'documents', targetId: GONE, body, failedAt: FAILED_AT }]);
      demiPush.document.callsFake(deletePush(true));
    });

    it('resends the kept body as a delete, after the flagged rows', async () => {
      await run();

      expect(demiPush.document.calledOnce).to.be.true;
      expect(demiPush.document.firstCall.args).to.deep.equal([body, { isDeleted: true }]);
      expect(demiPush.project.calledBefore(demiPush.document)).to.be.true;
    });

    it('drops the tombstone once DEMI takes the delete', async () => {
      const summary = await run();

      expect(models.DemiPushTombstone.deleteOne.calledOnceWithExactly({ kind: 'documents', targetId: GONE })).to.be.true;
      expect(models.DemiPushTombstone.updateOne.called).to.be.false;
      expect(summary.tombstones).to.deep.equal({ found: 1, pushed: 1, failed: 0 });
    });

    it('keeps the tombstone with a newer failure time and reason when the resend fails', async () => {
      demiPush.document.callsFake(deletePush(false));

      const summary = await run();

      const [filter, change, options] = models.DemiPushTombstone.updateOne.firstCall.args;
      expect(filter).to.deep.equal({ kind: 'documents', targetId: GONE });
      expect(change.$set).to.include({ error: 'PARENT_NOT_FOUND' });
      expect(change.$set.failedAt.getTime()).to.be.greaterThan(FAILED_AT.getTime());
      expect(options).to.deep.equal({ upsert: true });
      expect(models.DemiPushTombstone.deleteOne.called).to.be.false;
      expect(summary.tombstones).to.deep.equal({ found: 1, pushed: 0, failed: 1 });
    });

    it('reads tombstones per kind, oldest failure first, up to the limit', async () => {
      await run({ limitPerKind: 7 });

      expect(models.DemiPushTombstone.find.calledWith({ kind: 'documents' })).to.be.true;
      expect(models.DemiPushTombstone.find.calledWith({ kind: 'users' })).to.be.false;
      expect(models.DemiPushTombstone.query.sort.firstCall.args[0]).to.deep.equal({ failedAt: 1 });
      expect(models.DemiPushTombstone.query.limit.firstCall.args[0]).to.equal(7);
    });

    it('waits minIntervalMs before a resend too', async () => {
      const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
      const pending = sweep({ minIntervalMs: 400 });

      // The project row goes at once; the delete waits its turn behind it.
      await clock.tickAsync(399);
      expect(demiPush.document.called).to.be.false;

      await clock.tickAsync(1);
      await pending;
      expect(demiPush.document.calledOnce).to.be.true;
    });

    it('marks tombstones it could not read and still returns the rows it swept', async () => {
      models.DemiPushTombstone.query.lean.rejects(new Error('mongo down'));

      const summary = await run();

      expect(summary.tombstones).to.deep.equal({ found: 0, pushed: 0, failed: 0, unreadable: true });
      expect(summary.project).to.deep.equal({ found: 1, pushed: 1, failed: 0 });
    });
  });
});

describe('demiPushKinds order', () => {
  const order = Object.keys(KINDS);

  Object.entries(PARENTS).forEach(([child, parents]) => {
    parents.forEach(parent => {
      it(`sweeps ${parent} before ${child}`, () => {
        expect(order.indexOf(parent)).to.be.within(0, order.indexOf(child) - 1);
      });
    });
  });
});
