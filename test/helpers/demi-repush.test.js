/**
 * Unit tests for scripts/demi-repush.js
 *
 * The iteration, checkpoint and concurrency logic runs against an injected cursor and a stubbed
 * push, so none of this needs Mongo or DEMI.
 */

const { expect } = require('chai');
const sinon = require('sinon');

const { buildQuery, KINDS, parseArgs, repush, validate } = require('../../scripts/demi-repush');

// Mimics the mongoose cursor: next() yields documents in order, then null forever.
function fakeCursor(docs) {
  const queue = docs.slice();
  return {
    closed: false,
    next: function () {
      return Promise.resolve(queue.shift() || null);
    },
    close: function () {
      this.closed = true;
      return Promise.resolve();
    }
  };
}

function docs(count) {
  return Array.from({ length: count }, (_, i) => ({ _id: `id-${i + 1}` }));
}

function quietLog() {
  return { info: sinon.stub(), error: sinon.stub(), warn: sinon.stub() };
}

// Enough of a mongoose model for buildQuery's date-path check.
function fakeModel(paths) {
  return { schema: { path: name => (paths[name] ? { instance: paths[name] } : undefined) } };
}

describe('demi-repush', () => {
  afterEach(() => sinon.restore());

  describe('buildQuery', () => {
    it('resumes after the checkpoint id', () => {
      const lastId = '5f9d88b9d1f2a40022a1b2c3';

      const query = buildQuery(KINDS.project, { model: fakeModel({}), lastId: lastId });

      expect(String(query._id.$gt)).to.equal(lastId);
    });

    it('starts from the top when there is no checkpoint', () => {
      const query = buildQuery(KINDS.project, { model: fakeModel({}) });

      expect(query).to.not.have.property('_id');
      expect(query._schemaName).to.equal('Project');
    });

    it('filters --since only on fields the schema stores as a Date', () => {
      const since = new Date('2026-01-01T00:00:00.000Z');
      // Only the 2018 block is a Date here; a String path would match on text order, so it is dropped.
      const model = fakeModel({ 'legislation_2018.dateUpdated': 'Date', 'legislation_2002.dateUpdated': 'String' });

      const query = buildQuery(KINDS.project, { model: model, since: since });

      expect(query.$or).to.deep.equal([{ 'legislation_2018.dateUpdated': { $gte: since } }]);
    });

    it('refuses --since on a kind with no date field rather than matching everything', () => {
      const call = () => buildQuery(KINDS.projectNotification, { model: fakeModel({}), since: new Date() });

      expect(call).to.throw(/no date field/);
    });
  });

  describe('repush', () => {
    it('pushes nothing on a dry run', async () => {
      const push = sinon.stub().resolves();
      const onCheckpoint = sinon.stub().resolves();

      const counts = await repush({ cursor: fakeCursor(docs(6)), push, onCheckpoint, log: quietLog(), dryRun: true });

      expect(push.called).to.be.false;
      expect(onCheckpoint.called).to.be.false;
      expect(counts).to.include({ seen: 6, pushed: 0, failed: 0 });
    });

    it('pushes every record once when live', async () => {
      const push = sinon.stub().resolves();

      const counts = await repush({ cursor: fakeCursor(docs(6)), push, log: quietLog(), dryRun: false });

      expect(push.callCount).to.equal(6);
      expect(counts.pushed).to.equal(6);
    });

    it('logs and counts a push that throws, and keeps going', async () => {
      const log = quietLog();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-2' })).rejects(new Error('mongo down'));

      const counts = await repush({ cursor: fakeCursor(docs(5)), push, log, dryRun: false, concurrency: 2 });

      expect(counts).to.include({ seen: 5, pushed: 4, failed: 1 });
      expect(counts.failedIds).to.deep.equal(['id-2']);
      expect(log.error.calledOnce).to.be.true;
      expect(log.error.firstCall.args[0]).to.contain('id-2');
    });

    it('counts a push that resolves false as a failure, which is what DEMI rejecting a PUT looks like', async () => {
      const log = quietLog();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-3' })).resolves(false);

      const counts = await repush({ cursor: fakeCursor(docs(5)), push, log, dryRun: false, concurrency: 2 });

      expect(counts).to.include({ seen: 5, pushed: 4, failed: 1 });
      expect(counts.failedIds).to.deep.equal(['id-3']);
      expect(log.error.calledOnce).to.be.true;
      expect(log.error.firstCall.args[0]).to.contain('id-3');
    });

    it('holds the checkpoint before a failed record instead of advancing past it', async () => {
      const onCheckpoint = sinon.stub().resolves();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-3' })).resolves(false);

      await repush({ cursor: fakeCursor(docs(6)), push, onCheckpoint, log: quietLog(), dryRun: false, concurrency: 2 });

      // Batches are [1,2] [3,4] [5,6]: id-3 fails, so nothing past id-2 is ever checkpointed.
      expect(onCheckpoint.args.map(call => call[0])).to.deep.equal(['id-2', 'id-2', 'id-2']);
    });

    it('checkpoints the record before the failed one when the failure lands mid-batch', async () => {
      const onCheckpoint = sinon.stub().resolves();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-2' })).resolves(false);

      await repush({ cursor: fakeCursor(docs(6)), push, onCheckpoint, log: quietLog(), dryRun: false, concurrency: 3 });

      // Batches are [1,2,3] [4,5,6]: id-2 fails at index 1, so the checkpoint stops at id-1.
      expect(onCheckpoint.args.map(call => call[0])).to.deep.equal(['id-1', 'id-1']);
    });

    it('keeps the previous run\'s checkpoint when the first record of a resumed run fails', async () => {
      const onCheckpoint = sinon.stub().resolves();
      const push = sinon.stub().resolves(false);

      await repush({ cursor: fakeCursor(docs(2)), push, onCheckpoint, log: quietLog(), dryRun: false, concurrency: 2, startId: 'id-0' });

      expect(onCheckpoint.firstCall.args[0]).to.equal('id-0');
    });

    it('honours --limit and stops reading the cursor', async () => {
      const cursor = fakeCursor(docs(10));
      const push = sinon.stub().resolves();

      const counts = await repush({ cursor, push, log: quietLog(), dryRun: false, limit: 3, concurrency: 2 });

      expect(counts.seen).to.equal(3);
      expect(push.callCount).to.equal(3);
      expect(cursor.closed).to.be.true;
    });

    it('checkpoints the last id of each settled batch', async () => {
      const onCheckpoint = sinon.stub().resolves();

      await repush({ cursor: fakeCursor(docs(5)), push: sinon.stub().resolves(), onCheckpoint, log: quietLog(), dryRun: false, concurrency: 2 });

      expect(onCheckpoint.args.map(call => call[0])).to.deep.equal(['id-2', 'id-4', 'id-5']);
    });

    it('keeps at most `concurrency` pushes in flight', async () => {
      let inFlight = 0;
      let peak = 0;
      const push = () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise(resolve => setImmediate(() => {
          inFlight--;
          resolve();
        }));
      };

      await repush({ cursor: fakeCursor(docs(12)), push, log: quietLog(), dryRun: false, concurrency: 4 });

      expect(peak).to.equal(4);
    });

    it('reports progress on the interval, not per record', async () => {
      const log = quietLog();

      await repush({ cursor: fakeCursor(docs(10)), push: sinon.stub().resolves(), log, dryRun: false, concurrency: 2, progressEvery: 4 });

      expect(log.info.args.map(call => call[0])).to.have.lengthOf(2);
      expect(log.info.firstCall.args[0]).to.contain('4 seen');
    });
  });

  describe('parseArgs and validate', () => {
    it('defaults to a dry run of projects', () => {
      const args = parseArgs([]);

      expect(args).to.include({ kind: 'project', live: false, concurrency: 4, limit: null, state: null });
      expect(validate(args)).to.be.null;
    });

    it('reads --kind, --since, --limit, --state and --live', () => {
      const args = parseArgs(['--kind', 'document', '--since', '2026-01-01', '--limit', '50', '--state', '/tmp/s.json', '--live']);

      expect(args.kind).to.equal('document');
      expect(args.since.toISOString()).to.equal('2026-01-01T00:00:00.000Z');
      expect(args.limit).to.equal(50);
      expect(args.state).to.equal('/tmp/s.json');
      expect(args.live).to.be.true;
      expect(validate(args)).to.be.null;
    });

    it('rejects an unknown kind', () => {
      expect(validate(parseArgs(['--kind', 'banana']))).to.contain('Unknown --kind');
    });

    it('rejects a --limit that is not a positive whole number', () => {
      expect(validate(parseArgs(['--limit', 'lots']))).to.contain('--limit');
    });

    it('rejects an unparseable --since', () => {
      expect(validate(parseArgs(['--since', 'yesterday']))).to.contain('--since');
    });

    // Caught here rather than in buildQuery, so the run exits on the argument before it connects.
    it('rejects --since on a kind whose model has no date field', () => {
      const problem = validate(parseArgs(['--kind', 'projectNotification', '--since', '2026-01-01']));

      expect(problem).to.contain('no date field');
    });
  });
});
