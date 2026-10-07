/**
 * Unit tests for api/helpers/pushClient.js: retry, 429 pacing and the dropped-push log line.
 *
 * fetch is stubbed and the clock is fake, so every wait below is ticked, never slept.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const pushClient = require('../../api/helpers/pushClient');

const defaultLog = winston.loggers.get('default');
const BASE_ENV = 'PUSH_CLIENT_TEST_BASE';
const START = Date.parse('2026-09-25T12:00:00Z');
const ID = '5f9d88b9d1f2a40022a1b2c3';

const reply = (status, headers) => new Response(null, { status, headers });
const throttled = retryAfter => reply(429, retryAfter === undefined ? {} : { 'Retry-After': retryAfter });

describe('pushClient', () => {
  let fetchStub;
  let errorStub;
  let clock;
  let client;

  beforeEach(() => {
    process.env[BASE_ENV] = 'https://push.example';
    fetchStub = sinon.stub(global, 'fetch');
    errorStub = sinon.stub(defaultLog, 'error');
    // Jitter is Math.random() * 1 s; pinned to 0 so the waits below are exact.
    sinon.stub(Math, 'random').returns(0);
    clock = sinon.useFakeTimers({ now: START, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    client = pushClient({ name: 'test', baseEnv: BASE_ENV, method: 'PUT' });
  });

  afterEach(() => {
    sinon.restore();
    pushClient.setPacer(null);
    delete process.env[BASE_ENV];
    delete process.env.DEMI_PUSH_CONCURRENCY;
    delete process.env.DEMI_PUSH_QUEUE_MAX;
  });

  // Starts a push, then reports how many fetches had gone out just before and right at `ms`.
  async function callsAround(ms) {
    const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
    await clock.tickAsync(ms - 1);
    const before = fetchStub.callCount;
    await clock.tickAsync(1);
    return { before, at: fetchStub.callCount, landed: pending };
  }

  describe('on a 429', () => {
    it('waits the Retry-After seconds, retries, and lands', async () => {
      fetchStub.onFirstCall().resolves(throttled('2')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(2000);

      expect(calls).to.include({ before: 1, at: 2 });
      expect(await calls.landed).to.be.true;
      expect(errorStub.called).to.be.false;
    });

    it('waits until a Retry-After HTTP-date', async () => {
      fetchStub.onFirstCall().resolves(throttled(new Date(START + 5000).toUTCString())).onSecondCall().resolves(reply(200));

      const calls = await callsAround(5000);

      expect(calls).to.include({ before: 1, at: 2 });
      expect(await calls.landed).to.be.true;
    });

    it('waits the 1 s minimum for a Retry-After HTTP-date already past', async () => {
      fetchStub.onFirstCall().resolves(throttled(new Date(START - 60000).toUTCString())).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('waits the 1 s minimum for a Retry-After that is not a number', async () => {
      fetchStub.onFirstCall().resolves(throttled('NaN')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('waits the 1 s minimum for a negative Retry-After', async () => {
      fetchStub.onFirstCall().resolves(throttled('-30')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('waits the 1 s minimum when Retry-After is missing', async () => {
      fetchStub.onFirstCall().resolves(throttled()).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('waits the 1 s minimum for a Retry-After of 0', async () => {
      fetchStub.onFirstCall().resolves(throttled('0')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('reads a fractional Retry-After in seconds', async () => {
      fetchStub.onFirstCall().resolves(throttled('1.5')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1500);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('reads a Retry-After with whitespace around it', async () => {
      fetchStub.onFirstCall().resolves({ ok: false, status: 429, headers: new Map([['retry-after', ' 3 ']]) })
        .onSecondCall().resolves(reply(200));

      const calls = await callsAround(3000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('caps a Retry-After of Infinity at 60 s', async () => {
      fetchStub.onFirstCall().resolves(throttled('Infinity')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(60000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('caps a very large Retry-After at 60 s', async () => {
      fetchStub.onFirstCall().resolves(throttled('86400')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(60000);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('adds up to 1 s of jitter to the wait', async () => {
      Math.random.returns(0.5);
      fetchStub.onFirstCall().resolves(throttled('2')).onSecondCall().resolves(reply(200));

      const calls = await callsAround(2500);

      expect(calls).to.include({ before: 1, at: 2 });
    });

    it('gives up after 3 retries and logs the record as dropped', async () => {
      fetchStub.resolves(throttled('1'));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.false;
      expect(fetchStub.callCount).to.equal(4);
      expect(errorStub.calledOnceWith(`[test] push-dropped projects ${ID}: rejected 429`)).to.be.true;
    });

    it('does not spend the 5xx retry on a 429', async () => {
      fetchStub.onFirstCall().resolves(throttled('1'))
        .onSecondCall().resolves(reply(503))
        .onThirdCall().resolves(reply(200));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.true;
      expect(fetchStub.callCount).to.equal(3);
    });

    it('still gives up on two 5xx after a 429', async () => {
      fetchStub.resolves(reply(503));
      fetchStub.onFirstCall().resolves(throttled('1'));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.false;
      expect(fetchStub.callCount).to.equal(3);
    });

    it('retries a 429 that follows a 5xx', async () => {
      fetchStub.onFirstCall().resolves(reply(503))
        .onSecondCall().resolves(throttled('1'))
        .onThirdCall().resolves(reply(200));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.true;
      expect(fetchStub.callCount).to.equal(3);
    });
  });

  describe('logUnsent', () => {
    it('names a push still waiting on a 429 as dropped', async () => {
      fetchStub.resolves(throttled('30'));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.tickAsync(0);
      pushClient.logUnsent();
      const logged = errorStub.args.map(args => args[0]);
      // Let the push land, so it leaves nothing pending for the next test.
      fetchStub.resolves(reply(200));
      await clock.runAllAsync();
      await pending;

      expect(logged).to.deep.equal([`[test] push-dropped projects ${ID}: failed (process stopping)`]);
    });

    it('names nothing once every push has settled', async () => {
      fetchStub.resolves(reply(200));

      await client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      pushClient.logUnsent();

      expect(errorStub.called).to.be.false;
    });
  });

  describe('with a pacer', () => {
    it('resolves false, not rejects, when the pacer throws', async () => {
      pushClient.setPacer({ acquire: () => Promise.reject(new Error('meter broke')) });

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.false;
      expect(fetchStub.called).to.be.false;
    });

    it('waits on a pacer with no pause before the first try and before the 5xx retry', async () => {
      const pacer = { acquire: sinon.stub().resolves() };
      pushClient.setPacer(pacer);
      fetchStub.onFirstCall().resolves(reply(503)).onSecondCall().resolves(reply(200));

      const pending = client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.true;
      expect(pacer.acquire.callCount).to.equal(2);
      expect(pacer.acquire.secondCall.calledBefore(fetchStub.secondCall)).to.be.true;
    });
  });

  describe('on other statuses', () => {
    [404, 409].forEach(status => {
      it(`does not retry a ${status}`, async () => {
        fetchStub.resolves(reply(status));

        const landed = await client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);

        expect(landed).to.be.false;
        expect(fetchStub.callCount).to.equal(1);
      });
    });

    it('cancels the body of a refused response so its connection is freed', async () => {
      const cancel = sinon.stub().resolves();
      fetchStub.resolves({ ok: false, status: 404, body: { cancel }, headers: new Map() });

      await client.push(`/eagle/projects/${ID}`, { doc: {} }, `projects ${ID}`);

      expect(cancel.calledOnce).to.be.true;
    });

    it('pauses 1 s before retrying a 5xx', async () => {
      fetchStub.onFirstCall().resolves(reply(502)).onSecondCall().resolves(reply(200));

      const calls = await callsAround(1000);

      expect(calls).to.include({ before: 1, at: 2 });
      expect(await calls.landed).to.be.true;
    });
  });

  describe('onRefused', () => {
    const refused = code => new Response(JSON.stringify({ error: 'Parent project or notification not found', code }), { status: 404 });

    it('hands a 404 with a parent-not-found code to the hook and logs no dropped push when it takes it', async () => {
      const onRefused = sinon.stub().returns(true);
      client = pushClient({ name: 'test', baseEnv: BASE_ENV, method: 'PUT', onRefused });
      const response = refused('PARENT_NOT_FOUND');
      fetchStub.resolves(response);

      const landed = await client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);

      expect(landed).to.be.false;
      expect(onRefused.firstCall.args[0]).to.deep.equal({ label: `documents ${ID}`, status: 404, code: 'PARENT_NOT_FOUND' });
      expect(errorStub.called).to.be.false;
      expect(response.bodyUsed, 'the body is read, which frees its connection').to.be.true;
    });

    it('still logs rejected 404 when the hook declines a refusal with no code', async () => {
      const onRefused = sinon.stub().returns(false);
      client = pushClient({ name: 'test', baseEnv: BASE_ENV, method: 'PUT', onRefused });
      fetchStub.resolves(reply(404));

      await client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);

      expect(onRefused.firstCall.args[0].code).to.be.null;
      expect(errorStub.calledOnceWith(`[test] push-dropped documents ${ID}: rejected 404`)).to.be.true;
    });

    it('does not offer the hook a 409', async () => {
      const onRefused = sinon.stub().returns(true);
      client = pushClient({ name: 'test', baseEnv: BASE_ENV, method: 'PUT', onRefused });
      fetchStub.resolves(reply(409));

      await client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);

      expect(onRefused.called).to.be.false;
      expect(errorStub.calledOnceWith(`[test] push-dropped documents ${ID}: rejected 409`)).to.be.true;
    });

    it('leaves a client without the hook logging a parent-not-found 404 as dropped', async () => {
      fetchStub.resolves(refused('PARENT_NOT_FOUND'));

      const landed = await client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);

      expect(landed).to.be.false;
      expect(errorStub.calledOnceWith(`[test] push-dropped documents ${ID}: rejected 404`)).to.be.true;
    });
  });

  describe('concurrency limit', () => {
    const idFor = n => ID.slice(0, -1) + n;
    const pushNumber = n => client.push(`/eagle/projects/${idFor(n)}`, { doc: {} }, `projects ${idFor(n)}`);

    // Every fetch answers 200 after `ms`, and the most ever open at once is kept.
    function trackInFlight(ms) {
      const seen = { now: 0, max: 0 };
      fetchStub.callsFake(() => {
        seen.now++;
        seen.max = Math.max(seen.max, seen.now);
        return new Promise(resolve => setTimeout(() => {
          seen.now--;
          resolve(reply(200));
        }, ms));
      });
      return seen;
    }

    it('keeps at most the limit in flight and still sends every queued push', async () => {
      process.env.DEMI_PUSH_CONCURRENCY = '2';
      const seen = trackInFlight(100);

      const pending = [1, 2, 3, 4, 5].map(pushNumber);
      await clock.runAllAsync();

      expect(await Promise.all(pending)).to.deep.equal([true, true, true, true, true]);
      expect(seen.max).to.equal(2);
      expect(fetchStub.callCount).to.equal(5);
    });

    it('drops the newest push and logs it when the queue is full', async () => {
      process.env.DEMI_PUSH_CONCURRENCY = '1';
      process.env.DEMI_PUSH_QUEUE_MAX = '1';
      trackInFlight(100);

      const pending = [1, 2, 3].map(pushNumber);

      expect(await pending[2]).to.be.false;
      expect(errorStub.args.map(args => args[0])).to.deep.equal([`[test] push-dropped projects ${idFor(3)}: queue full`]);
      await clock.runAllAsync();
      expect(await Promise.all(pending.slice(0, 2))).to.deep.equal([true, true]);
      expect(fetchStub.callCount).to.equal(2);
    });

    it('frees the slot of a push that timed out', async () => {
      process.env.DEMI_PUSH_CONCURRENCY = '1';
      // AbortSignal.timeout runs on a real timer; this one runs on the fake clock.
      sinon.stub(AbortSignal, 'timeout').callsFake(ms => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
        return controller.signal;
      });
      fetchStub.callsFake((url, init) => {
        if (url.endsWith(idFor(2))) {
          return Promise.resolve(reply(200));
        }
        return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
      });

      const first = pushNumber(1);
      const second = pushNumber(2);
      // Both tries of the first push time out, with the 1 s retry pause between them.
      await clock.tickAsync(20999);
      expect(fetchStub.callCount).to.equal(2);
      await clock.tickAsync(1);

      expect(await first).to.be.false;
      expect(await second).to.be.true;
      expect(fetchStub.lastCall.args[0]).to.match(new RegExp(`${idFor(2)}$`));
    });

    ['abc', '0', '-1', '2.5'].forEach(raw => {
      it(`falls back to 8 in flight and warns once for DEMI_PUSH_CONCURRENCY=${raw}`, async () => {
        process.env.DEMI_PUSH_CONCURRENCY = raw;
        const warnStub = sinon.stub(defaultLog, 'warn');
        const seen = trackInFlight(100);

        const pending = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(pushNumber);
        await clock.runAllAsync();
        await Promise.all(pending);

        expect(seen.max).to.equal(8);
        expect(warnStub.args.map(args => args[0])).to.deep.equal([
          `[test] DEMI_PUSH_CONCURRENCY=${raw} is not a positive whole number — using 8`
        ]);
      });
    });
  });

  describe('dropped pushes', () => {
    // migrations/README.md turns these lines into an --ids-file with this pattern.
    const DROPPED_ID = /push-dropped [a-z]+ ([0-9a-f]{24}):/;

    it('logs a rejected record in a line the documented pattern reads the id back from', async () => {
      fetchStub.resolves(reply(404));

      await client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);

      expect(errorStub.firstCall.args[0].match(DROPPED_ID)[1]).to.equal(ID);
    });

    it('logs a record whose fetch kept throwing the same way', async () => {
      fetchStub.rejects(new Error('ECONNRESET'));

      const pending = client.push(`/eagle/documents/${ID}`, { doc: {} }, `documents ${ID}`);
      await clock.runAllAsync();

      expect(await pending).to.be.false;
      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.firstCall.args[0].match(DROPPED_ID)[1]).to.equal(ID);
      expect(errorStub.firstCall.args[1].error).to.equal('ECONNRESET');
    });
  });
});
