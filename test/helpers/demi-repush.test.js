/**
 * Unit tests for scripts/demi-repush.js
 *
 * The iteration, checkpoint and concurrency logic runs against an injected cursor and a stubbed
 * push, so none of this needs Mongo or DEMI.
 */

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');

const mongoose = require('mongoose');

const {
  buildQuery,
  KINDS,
  MAX_CURSOR_REOPENS,
  kindJob,
  kindQuery,
  pacerFor,
  parseArgs,
  planKind,
  rateMeter,
  readIds,
  repush,
  runKinds,
  statePathFor,
  validate
} = require('../../scripts/demi-repush');
const demiPush = require('../../api/helpers/demiPush');
const pushClient = require('../../api/helpers/pushClient');

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

// A cursor the server dropped: yields `docs`, then next() rejects the way the driver does.
function lostCursor(docs) {
  const cursor = fakeCursor(docs);
  const next = cursor.next;
  cursor.next = function () {
    return next.call(this).then(doc => doc || Promise.reject(cursorNotFound()));
  };
  return cursor;
}

function cursorNotFound() {
  return Object.assign(new Error('cursor id 8427216537129683474 not found'), { name: 'MongoServerError', code: 43, codeName: 'CursorNotFound' });
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

    it('filters a project --since on every legislation block the Project schema stores, 2025 included', () => {
      const since = new Date('2026-01-01T00:00:00.000Z');

      const query = buildQuery(KINDS.project, { model: mongoose.model('Project'), since: since });

      expect(query.$or).to.deep.equal([
        { 'legislation_1996.dateUpdated': { $gte: since } },
        { 'legislation_2002.dateUpdated': { $gte: since } },
        { 'legislation_2018.dateUpdated': { $gte: since } },
        { 'legislation_2025.dateUpdated': { $gte: since } }
      ]);
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

    it('moves the checkpoint past a failed record, so a rerun pushes nothing twice', async () => {
      const onCheckpoint = sinon.stub().resolves();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-3' })).resolves(false);

      await repush({ cursor: fakeCursor(docs(6)), push, onCheckpoint, log: quietLog(), dryRun: false, concurrency: 2 });

      // Batches are [1,2] [3,4] [5,6].
      expect(onCheckpoint.args.map(call => call[0])).to.deep.equal(['id-2', 'id-4', 'id-6']);
    });

    it('hands the failed id to the checkpoint', async () => {
      const onCheckpoint = sinon.stub().resolves();
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: 'id-1' })).resolves(false);

      await repush({ cursor: fakeCursor(docs(4)), push, onCheckpoint, log: quietLog(), dryRun: false, concurrency: 2 });

      expect(onCheckpoint.lastCall.args[1].failedIds).to.deep.equal(['id-1']);
    });

    it('reopens a lost cursor after the last record read and finishes the kind', async () => {
      const all = docs(6);
      const reopen = sinon.spy(lastId => Promise.resolve(fakeCursor(all.slice(all.findIndex(doc => doc._id === lastId) + 1))));
      const push = sinon.stub().resolves(true);

      const counts = await repush({ cursor: lostCursor(all.slice(0, 3)), reopen, push, log: quietLog(), dryRun: false, concurrency: 2 });

      expect(reopen.args).to.deep.equal([['id-3']]);
      expect(push.args.map(call => call[0]._id)).to.deep.equal(['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6']);
      expect(counts.pushed).to.equal(6);
    });

    it('gives up after MAX_CURSOR_REOPENS lost cursors in a row', async () => {
      const reopen = sinon.spy(() => Promise.resolve(lostCursor([])));

      const err = await repush({ cursor: lostCursor(docs(1)), reopen, push: sinon.stub().resolves(true), log: quietLog(), dryRun: false })
        .then(() => null, rejected => rejected);

      expect(err.code).to.equal(43);
      expect(reopen.callCount).to.equal(MAX_CURSOR_REOPENS);
    });

    it('does not reopen the cursor on any other read error', async () => {
      const cursor = fakeCursor([]);
      cursor.next = () => Promise.reject(new Error('connection reset'));
      const reopen = sinon.spy();

      const err = await repush({ cursor, reopen, push: sinon.stub().resolves(true), log: quietLog(), dryRun: false })
        .then(() => null, rejected => rejected);

      expect(err.message).to.equal('connection reset');
      expect(reopen.called).to.be.false;
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

  describe('KINDS', () => {
    // A kind naming a helper or model that does not exist would only fail at run time, mid-walk.
    Object.keys(KINDS).forEach(name => {
      it(`${name} pushes through a demiPush export and reads a registered model`, () => {
        const kind = KINDS[name];

        expect(demiPush).to.respondTo(kind.push);
        expect(mongoose.model(kind.model).modelName).to.equal(kind.schemaName);
      });
    });

    it('repushes Updates as RecentActivity rows', () => {
      const query = buildQuery(KINDS.recentActivity, { model: fakeModel({}) });

      expect(query._schemaName).to.equal('RecentActivity');
    });
  });

  // demiPush skips these kinds unless DEMI_PUSH_OPT_IN_KINDS names them, so a live run must not count
  // records as pushed while nothing was sent.
  describe('opt-in kinds', () => {
    const SCRIPT = path.join(__dirname, '../../scripts/demi-repush.js');
    let originalEnv;

    beforeEach(() => {
      originalEnv = Object.assign({}, process.env);
      process.env.DEMI_API_BASE = 'https://demi.test';
      process.env.DEMI_APIM_KEY = 'test-key';
      delete process.env.DEMI_PUSH_OPT_IN_KINDS;
    });

    afterEach(() => {
      ['DEMI_API_BASE', 'DEMI_APIM_KEY', 'DEMI_PUSH_OPT_IN_KINDS'].forEach(name => {
        if (originalEnv[name] === undefined) { delete process.env[name]; } else { process.env[name] = originalEnv[name]; }
      });
    });

    it('exits 2 before any push for a kind not opted in', () => {
      // Port 9 is discard: had the run gone on to push, it would fail rather than exit 2.
      const env = Object.assign({}, process.env, { DEMI_API_BASE: 'http://127.0.0.1:9' });
      const result = childProcess.spawnSync(process.execPath, [SCRIPT, '--kind', 'group', '--live'], { env, encoding: 'utf8', timeout: 5000 });

      expect(result.status).to.equal(2);
      expect(result.stderr).to.contain('--kind group pushes nothing until DEMI_PUSH_OPT_IN_KINDS includes groups');
    });

    it('sends an opted-in kind to its DEMI route', async () => {
      process.env.DEMI_PUSH_OPT_IN_KINDS = 'groups';
      const fetchStub = sinon.stub(global, 'fetch').resolves(new Response(null, { status: 200 }));

      expect(validate(parseArgs(['--kind', 'group', '--live']))).to.be.null;
      const counts = await repush({
        cursor: fakeCursor([{ _id: 'g1' }]), push: doc => demiPush[KINDS.group.push](doc), log: quietLog(), dryRun: false
      });

      expect(counts).to.include({ pushed: 1, failed: 0 });
      expect(fetchStub.firstCall.args[0]).to.equal('https://demi.test/eagle/groups/g1');
    });
  });

  describe('parseArgs and validate', () => {
    it('defaults to a dry run', () => {
      const args = parseArgs(['--kind', 'document']);

      expect(args).to.include({ live: false, concurrency: 4, rate: 150, limit: null, state: null, idsFile: null });
      expect(validate(args)).to.be.null;
    });

    it('requires --kind or --kinds rather than picking one', () => {
      expect(validate(parseArgs([]))).to.contain('--kind or --kinds is required');
    });

    // What `--ids-file $IDS --live` becomes when IDS is unset, or `--ids-file "$IDS"` when empty.
    it('refuses a value flag followed straight by another flag', () => {
      expect(validate(parseArgs(['--kind', 'document', '--ids-file', '--live']))).to.equal('--ids-file needs a value');
    });

    it('refuses a value flag given an empty value', () => {
      expect(validate(parseArgs(['--kind', 'document', '--ids-file', '', '--live']))).to.equal('--ids-file needs a value');
    });

    it('refuses a value flag with nothing after it', () => {
      expect(validate(parseArgs(['--kind', 'document', '--since']))).to.equal('--since needs a value');
    });

    it('refuses the project kind at a concurrency above 1', () => {
      expect(validate(parseArgs(['--kind', 'project', '--concurrency', '2']))).to.contain('--concurrency 1');
    });

    it('refuses a live project run without --ids-file', () => {
      expect(validate(parseArgs(['--kind', 'project', '--concurrency', '1', '--live']))).to.contain('needs --ids-file');
    });

    it('takes a live project run over an --ids-file at concurrency 1', () => {
      expect(validate(parseArgs(['--kind', 'project', '--concurrency', '1', '--ids-file', '/tmp/ids.txt', '--live']))).to.be.null;
    });

    it('reads --kind, --since, --limit, --state and --live', () => {
      const args = parseArgs(['--kind', 'document', '--since', '2026-01-01', '--limit', '50', '--state', '/tmp/s.json', '--live']);

      expect(args.kinds).to.deep.equal(['document']);
      expect(args.since.toISOString()).to.equal('2026-01-01T00:00:00.000Z');
      expect(args.limit).to.equal(50);
      expect(args.state).to.equal('/tmp/s.json');
      expect(args.live).to.be.true;
      expect(validate(args)).to.be.null;
    });

    it('takes --since on Updates, whose date fields are Dates', () => {
      expect(validate(parseArgs(['--kind', 'recentActivity', '--since', '2026-01-01']))).to.be.null;
    });

    it('rejects an unknown kind', () => {
      expect(validate(parseArgs(['--kind', 'banana']))).to.contain('Unknown --kind');
    });

    it('rejects a --limit that is not a positive whole number', () => {
      expect(validate(parseArgs(['--kind', 'document', '--limit', 'lots']))).to.contain('--limit');
    });

    it('rejects an unparseable --since', () => {
      expect(validate(parseArgs(['--kind', 'document', '--since', 'yesterday']))).to.contain('--since');
    });

    // Caught here rather than in buildQuery, so the run exits on the argument before it connects.
    it('rejects --since on a kind whose model has no date field', () => {
      const problem = validate(parseArgs(['--kind', 'projectNotification', '--since', '2026-01-01']));

      expect(problem).to.contain('no date field');
    });

    it('rejects --since when any one of --kinds has no date field', () => {
      const problem = validate(parseArgs(['--kinds', 'commentPeriod,projectNotification', '--since', '2026-01-01']));

      expect(problem).to.contain('ProjectNotification has no date field');
    });

    it('reads --kinds in the order given and drops a repeat', () => {
      const args = parseArgs(['--kinds', 'commentPeriod, comment,commentPeriod']);

      expect(args.kinds).to.deep.equal(['commentPeriod', 'comment']);
      expect(validate(args)).to.be.null;
    });

    it('names the unknown one in --kinds', () => {
      expect(validate(parseArgs(['--kinds', 'project,banana']))).to.contain('Unknown --kind banana');
    });

    it('reads --rate and --ids-file', () => {
      const args = parseArgs(['--kind', 'document', '--rate', '30', '--ids-file', '/tmp/ids.txt']);

      expect(args).to.include({ rate: 30, idsFile: '/tmp/ids.txt' });
      expect(validate(args)).to.be.null;
    });

    it('rejects a --rate of zero, since it would never send', () => {
      expect(validate(parseArgs(['--kind', 'document', '--rate', '0']))).to.contain('--rate takes');
    });

    it('rejects a --rate below 1 a minute', () => {
      expect(validate(parseArgs(['--kind', 'document', '--rate', '0.5']))).to.contain('--rate takes');
    });

    it('rejects --kind and --kinds given together', () => {
      expect(validate(parseArgs(['--kind', 'project', '--kinds', 'document']))).to.contain('not both');
    });
  });

  describe('--ids-file', () => {
    const A = '5f9d88b9d1f2a40022a1b2c3';
    const B = '5f9d88b9d1f2a40022a1b2c4';
    let dir;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demi-repush-'));
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    function idsFile(text) {
      const file = path.join(dir, 'ids.txt');
      fs.writeFileSync(file, text);
      return file;
    }

    it('reads ids split by newlines, spaces or commas, once each', () => {
      expect(readIds(idsFile(`${A}\n${B}, ${A}\n\n`))).to.deep.equal([A, B]);
    });

    it('refuses a value that is not a 24-character hex id', () => {
      expect(() => readIds(idsFile(`${A}\nprojects\n`))).to.throw(/"projects" is not a 24-character Mongo id/);
    });

    it('refuses an empty file rather than matching nothing', () => {
      expect(() => readIds(idsFile('\n'))).to.throw(/holds no ids/);
    });

    it('narrows the query to the listed ids of the kind being pushed', () => {
      const query = buildQuery(KINDS.document, { model: fakeModel({}), ids: [A, B] });

      expect(query._schemaName).to.equal('Document');
      expect(query._id.$in.map(String)).to.deep.equal([A, B]);
    });

    it('keeps the resume point alongside the ids', () => {
      const query = buildQuery(KINDS.document, { model: fakeModel({}), ids: [A, B], lastId: A });

      expect(String(query._id.$gt)).to.equal(A);
      expect(query._id.$in.map(String)).to.deep.equal([A, B]);
    });
  });

  describe('statePathFor', () => {
    it('keeps the --state path as given for a single kind, so an old checkpoint still resumes', () => {
      expect(statePathFor('/tmp/r.json', 'project', 1)).to.equal('/tmp/r.json');
    });

    it('gives each of several kinds its own file', () => {
      expect(statePathFor('/tmp/r.json', 'comment', 2)).to.equal('/tmp/r.comment.json');
    });
  });

  describe('rateMeter', () => {
    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      pushClient.setPacer(null);
      delete process.env.DEMI_REPUSH_TEST_BASE;
    });

    function startAll(meter, count) {
      const started = { count: 0 };
      Array.from({ length: count }, () => meter.acquire().then(() => started.count++));
      return started;
    }

    function throttledClient(retryAfter) {
      process.env.DEMI_REPUSH_TEST_BASE = 'https://push.example';
      const fetchStub = sinon.stub(global, 'fetch').callsFake(() => Promise.resolve(new Response(null, { status: 200 })));
      fetchStub.onFirstCall().resolves(new Response(null, { status: 429, headers: { 'Retry-After': retryAfter } }));
      sinon.stub(Math, 'random').returns(0);
      const client = pushClient({ name: 'test', baseEnv: 'DEMI_REPUSH_TEST_BASE', method: 'PUT' });
      return { fetchStub, client };
    }

    it('lets no more than the rate start in a closed 60 s window', async () => {
      const started = startAll(rateMeter(3), 10);

      // Starts at 0, 20.2 s and 40.4 s; the 1% margin keeps the fourth off the 60 s mark.
      await clock.tickAsync(60000);
      expect(started.count).to.equal(3);

      await clock.tickAsync(600);
      expect(started.count).to.equal(4);
    });

    // The most starts any closed window of `span` ms holds.
    function busiestWindow(times, span) {
      return Math.max(...times.map(start => times.filter(t => t >= start && t <= start + span).length));
    }

    it('spaces the next call from a late send, not from its reserved slot', async () => {
      // The second caller's slot is 20.2 s; it gets to run 5 s late, as a busy event loop would.
      sinon.stub(Date, 'now').callsFake(() => clock.now + (clock.now === 20200 ? 5000 : 0));
      const meter = rateMeter(3);
      const sends = [];
      Array.from({ length: 6 }, () => meter.acquire().then(() => sends.push(Date.now())));

      await clock.tickAsync(200000);

      expect(sends).to.have.lengthOf(6);
      expect(sends[1]).to.equal(25200);
      expect(busiestWindow(sends, 60000)).to.equal(3);
    });

    it('meters the retry of a 429 as one more call', async () => {
      const { fetchStub, client } = throttledClient('1');
      // 6 a minute: one slot every 10.1 s, far longer than the 1 s Retry-After.
      pushClient.setPacer(rateMeter(6));

      const pending = client.push('/eagle/projects/p1', {}, 'projects p1');
      await clock.tickAsync(10099);
      expect(fetchStub.callCount).to.equal(1);

      await clock.tickAsync(1);
      expect(fetchStub.callCount).to.equal(2);
      expect(await pending).to.be.true;
    });

    it('holds another caller too when a push gets a 429', async () => {
      const { fetchStub, client } = throttledClient('30');
      pushClient.setPacer(rateMeter(60));

      const first = client.push('/eagle/projects/p1', {}, 'projects p1');
      // Its slot, 1.01 s in, was handed out before the 429 arrived.
      const second = client.push('/eagle/projects/p2', {}, 'projects p2');
      await clock.tickAsync(29999);
      expect(fetchStub.callCount).to.equal(1);

      await clock.tickAsync(1010 + 1);
      expect(fetchStub.callCount).to.equal(3);
      expect(await first).to.be.true;
      expect(await second).to.be.true;
    });

    it('holds a caller whose slot was handed out before the pause', async () => {
      const meter = rateMeter(60);
      const started = startAll(meter, 2);
      meter.pause(30000);

      await clock.tickAsync(29999);
      expect(started.count).to.equal(1);

      await clock.tickAsync(1);
      expect(started.count).to.equal(2);
    });
  });

  describe('pacerFor', () => {
    it('paces a live run', () => {
      expect(pacerFor(parseArgs(['--live']))).to.respondTo('acquire');
    });

    it('leaves a dry run unpaced', () => {
      expect(pacerFor(parseArgs([]))).to.be.null;
    });
  });

  describe('planKind', () => {
    const A = '5f9d88b9d1f2a40022a1b2c3';
    const B = '5f9d88b9d1f2a40022a1b2c4';
    const reader = files => file => files[file] || null;

    it('resumes a checkpoint written before id lists were recorded', () => {
      const args = parseArgs(['--state', '/tmp/r.json']);

      const plan = planKind(args, 'project', reader({ '/tmp/r.json': { kind: 'project', lastId: A } }));

      expect(plan.lastId).to.equal(A);
    });

    it('resumes a checkpoint over the same ids in another order', () => {
      const args = Object.assign(parseArgs(['--state', '/tmp/r.json']), { ids: [B, A] });
      const written = planKind(Object.assign({}, args, { ids: [A, B] }), 'project', reader({})).ids;

      const plan = planKind(args, 'project', reader({ '/tmp/r.json': { kind: 'project', ids: written, lastId: A } }));

      expect(plan.lastId).to.equal(A);
    });

    it('starts over when the id list differs from the checkpoint\'s', () => {
      const args = Object.assign(parseArgs(['--state', '/tmp/r.json']), { ids: [A, B] });
      const written = planKind(Object.assign({}, args, { ids: [A] }), 'project', reader({})).ids;

      const plan = planKind(args, 'project', reader({ '/tmp/r.json': { kind: 'project', ids: written, lastId: A } }));

      expect(plan.lastId).to.be.null;
    });

    it('starts over when a whole-collection checkpoint meets an id list', () => {
      const args = Object.assign(parseArgs(['--state', '/tmp/r.json']), { ids: [A] });

      const plan = planKind(args, 'project', reader({ '/tmp/r.json': { kind: 'project', lastId: A } }));

      expect(plan.lastId).to.be.null;
    });

    it('reads each kind\'s own checkpoint under --kinds', () => {
      const args = parseArgs(['--kinds', 'project,comment', '--state', '/tmp/r.json']);
      const files = {
        '/tmp/r.project.json': { kind: 'project', lastId: A },
        '/tmp/r.comment.json': { kind: 'comment', lastId: B }
      };

      const plan = planKind(args, 'comment', reader(files));

      expect(plan).to.include({ statePath: '/tmp/r.comment.json', lastId: B });
    });

    it('does not reuse a single-kind checkpoint under --kinds', () => {
      const args = parseArgs(['--kinds', 'project,comment', '--state', '/tmp/r.json']);

      const plan = planKind(args, 'project', reader({ '/tmp/r.json': { kind: 'project', lastId: A } }));

      expect(plan.lastId).to.be.null;
    });

    it('resumes a checkpoint written with the same --since', () => {
      const args = parseArgs(['--kind', 'document', '--state', '/tmp/r.json', '--since', '2026-01-01']);
      const files = { '/tmp/r.json': { kind: 'document', since: '2026-01-01T00:00:00.000Z', lastId: A } };

      expect(planKind(args, 'document', reader(files)).lastId).to.equal(A);
    });

    it('starts over when --since differs from the checkpoint\'s', () => {
      const args = parseArgs(['--kind', 'document', '--state', '/tmp/r.json', '--since', '2026-02-01']);
      const files = { '/tmp/r.json': { kind: 'document', since: '2026-01-01T00:00:00.000Z', lastId: A } };

      expect(planKind(args, 'document', reader(files)).lastId).to.be.null;
    });

    it('starts over when a checkpoint without --since meets a run with one', () => {
      const args = parseArgs(['--kind', 'document', '--state', '/tmp/r.json', '--since', '2026-01-01']);

      expect(planKind(args, 'document', reader({ '/tmp/r.json': { kind: 'document', lastId: A } })).lastId).to.be.null;
    });
  });

  describe('kindJob', () => {
    const A = '5f9d88b9d1f2a40022a1b2c3';
    const B = '5f9d88b9d1f2a40022a1b2c4';
    const running = { seen: 2, pushed: 2, failed: 0, failedIds: [] };

    function job(argv, ids) {
      const args = Object.assign(parseArgs(argv), { ids: ids });
      const plan = planKind(args, args.kinds[0], () => null);
      return kindJob(args, args.kinds[0], plan, fakeModel({ dateUpdated: 'Date' }));
    }

    it('narrows the query to the ids from --ids-file', () => {
      const { query } = job(['--kind', 'comment'], [A, B]);

      expect(query._id.$in.map(String)).to.deep.equal([A, B]);
    });

    it('writes the id list\'s count and hash to the checkpoint', () => {
      const state = job(['--kind', 'comment'], [A, B]).checkpoint(B, running);

      expect(state).to.include({ kind: 'comment', lastId: B });
      expect(state.ids.count).to.equal(2);
      expect(state.ids.sha256).to.match(/^[0-9a-f]{64}$/);
    });

    it('writes --since to the checkpoint', () => {
      const state = job(['--kind', 'comment', '--since', '2026-01-01']).checkpoint(A, running);

      expect(state.since).to.equal('2026-01-01T00:00:00.000Z');
      expect(state.ids).to.be.null;
    });
  });

  describe('resume after a failure', () => {
    // Six comments in _id order; the first one is refused, as an orphan of a missing period would be.
    const ids = Array.from({ length: 6 }, (_, i) => `5f9d88b9d1f2a40022a1b2c${i}`);
    const args = parseArgs(['--kind', 'comment', '--state', '/tmp/r.json', '--live']);
    const model = fakeModel({ dateUpdated: 'Date' });

    // Runs the first four records, then stops as a dropped session would, and returns the state file.
    async function firstRun() {
      const files = {};
      const job = kindJob(args, 'comment', planKind(args, 'comment', () => null), model);
      const push = sinon.stub().resolves(true);
      push.withArgs(sinon.match({ _id: ids[0] })).resolves(false);

      await repush({
        cursor: fakeCursor(ids.map(id => ({ _id: id }))),
        push,
        onCheckpoint: (id, running) => { files['/tmp/r.json'] = job.checkpoint(id, running); },
        log: quietLog(),
        dryRun: false,
        concurrency: 2,
        limit: 4
      });
      return file => files[file] || null;
    }

    it('starts after the last record read, not before the failed one', async () => {
      const plan = planKind(args, 'comment', await firstRun());

      expect(String(kindJob(args, 'comment', plan, model).query._id.$gt)).to.equal(ids[3]);
    });

    it('skips the failed id', async () => {
      const plan = planKind(args, 'comment', await firstRun());

      expect(kindJob(args, 'comment', plan, model).query._id.$nin.map(String)).to.deep.equal([ids[0]]);
    });

    it('keeps the earlier failed id in the next checkpoint', async () => {
      const plan = planKind(args, 'comment', await firstRun());
      const running = { seen: 2, pushed: 1, failed: 1, failedIds: [ids[5]] };

      expect(kindJob(args, 'comment', plan, model).checkpoint(ids[5], running).failedIds).to.deep.equal([ids[0], ids[5]]);
    });

    it('skips the failedIds of a checkpoint written before lastId moved past failures', () => {
      const old = { '/tmp/r.json': { kind: 'comment', lastId: ids[0], failedIds: [ids[1]] } };

      const plan = planKind(args, 'comment', file => old[file] || null);

      expect(kindJob(args, 'comment', plan, model).query._id.$nin.map(String)).to.deep.equal([ids[1]]);
    });

    it('reopens a lost cursor with the same filters, after the last record read', async () => {
      const plan = planKind(args, 'comment', await firstRun());

      const query = kindJob(args, 'comment', plan, model).queryAfter(ids[4]);

      expect(String(query._id.$gt)).to.equal(ids[4]);
      expect(query._id.$nin.map(String)).to.deep.equal([ids[0]]);
    });
  });

  describe('kindQuery', () => {
    // A batch the size of Mongo's default (16 MB) outlasts the server's idle cursor timeout at a paced rate.
    it('reads the kind in batches of 100, in _id order', () => {
      const options = kindQuery(mongoose.model('Comment'), { _schemaName: 'Comment' }).getOptions();

      expect(options).to.deep.include({ batchSize: 100, sort: { _id: 1 } });
    });
  });

  describe('runKinds', () => {
    function runOne(failedByKind) {
      const ran = [];
      const fn = (args, name) => {
        ran.push(name);
        return Promise.resolve({ failed: failedByKind[name] || 0 });
      };
      return { ran, fn };
    }

    it('stops after a kind with failures, since its children would be refused', async () => {
      const one = runOne({ project: 2 });
      const log = quietLog();

      const counts = await runKinds(parseArgs(['--kinds', 'project,document,comment']), one.fn, log);

      expect(one.ran).to.deep.equal(['project']);
      expect(counts.failed).to.equal(2);
      expect(log.error.firstCall.args[0]).to.contain('document, comment not run');
    });

    it('goes on past a failed kind with --continue-on-failure', async () => {
      const one = runOne({ project: 2, comment: 1 });

      const counts = await runKinds(parseArgs(['--kinds', 'project,document,comment', '--continue-on-failure']), one.fn, quietLog());

      expect(one.ran).to.deep.equal(['project', 'document', 'comment']);
      expect(counts.failed).to.equal(3);
    });
  });
});
