/**
 * Unit Tests for API Helpers - Analytics
 *
 * The outbound event and audit buffers: dark until configured, batched, capped to what the ingest API
 * accepts, and never able to fail the request that produced a row.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const analytics = require('../../api/helpers/analytics');
const defaultLog = winston.loggers.get('default');

const URL = 'https://analytics-test.example/analytics';
const AUDIT_URL = 'https://analytics-test.example/analytics-machine';
const KEY = 'test-key';
const okResponse = () => ({ ok: true, status: 200 });

const auth = { sub: 'kc-1', preferred_username: 'tester', realm_access: { roles: ['sysadmin', 'staff'] } };
const argsWith = payload => ({ swagger: { params: { auth_payload: payload } } });

/** The body of the nth fetch call, parsed. */
const sentBody = (fetchStub, n = 0) => JSON.parse(fetchStub.args[n][1].body);

describe('Analytics Helper', () => {
  let fetchStub;
  let warnStub;
  let errorStub;
  const original = {};

  beforeEach(() => {
    ['ANALYTICS_API_URL', 'ANALYTICS_AUDIT_URL', 'ANALYTICS_API_KEY'].forEach(name => { original[name] = process.env[name]; });
    process.env.ANALYTICS_API_URL = URL;
    process.env.ANALYTICS_AUDIT_URL = AUDIT_URL;
    process.env.ANALYTICS_API_KEY = KEY;
    fetchStub = sinon.stub(global, 'fetch').resolves(okResponse());
    warnStub = sinon.stub(defaultLog, 'warn');
    errorStub = sinon.stub(defaultLog, 'error');
  });

  afterEach(() => {
    // Buffers are process-wide: empty them before restoring the stubs so a leftover row cannot leak
    // into the next spec's assertions.
    analytics._buffers.events.rows.length = 0;
    analytics._buffers.audit.rows.length = 0;
    analytics._clearTimer();
    sinon.restore();
    Object.keys(original).forEach(name => {
      if (original[name] === undefined) { delete process.env[name]; } else { process.env[name] = original[name]; }
    });
  });

  describe('dark by default', () => {
    it('buffers nothing and never fetches when ANALYTICS_API_URL is unset', async () => {
      delete process.env.ANALYTICS_API_URL;

      analytics.trackEvent('Search Executed', { dataset: 'Document' });
      await analytics.flush();

      expect(analytics._buffers.events.rows).to.have.lengthOf(0);
      expect(fetchStub.called).to.be.false;
    });

    it('stays dark for audit rows when ANALYTICS_AUDIT_URL is unset', async () => {
      delete process.env.ANALYTICS_AUDIT_URL;

      analytics.auditEvent({ action: 'Post' });
      await analytics.flush();

      expect(analytics._buffers.audit.rows).to.have.lengthOf(0);
      expect(fetchStub.called).to.be.false;
    });

    it('stays dark for audit rows when ANALYTICS_API_KEY is unset, since that API is keyed', async () => {
      delete process.env.ANALYTICS_API_KEY;

      analytics.auditEvent({ action: 'Post' });
      await analytics.flush();

      expect(fetchStub.called).to.be.false;
    });

    it('still sends events when ANALYTICS_API_KEY is unset, since that API is anonymous', async () => {
      delete process.env.ANALYTICS_API_KEY;

      analytics.trackEvent('Search Executed', { dataset: 'Document' });
      await analytics.flush();

      expect(fetchStub.calledOnce).to.be.true;
      expect(fetchStub.args[0][1].headers).to.not.have.property('Ocp-Apim-Subscription-Key');
    });
  });

  describe('buffering', () => {
    it('holds a row back rather than posting it one at a time', () => {
      analytics.trackEvent('Document Downloaded', { document_id: 'd1' });

      expect(analytics._buffers.events.rows).to.have.lengthOf(1);
      expect(fetchStub.called).to.be.false;
    });

    it('posts on its own once 20 rows are buffered, and empties the buffer', () => {
      for (let i = 0; i < 20; i++) {
        analytics.trackEvent('Document Downloaded', { document_id: `d${i}` });
      }

      expect(fetchStub.calledOnce).to.be.true;
      expect(sentBody(fetchStub).events).to.have.lengthOf(20);
      expect(analytics._buffers.events.rows).to.have.lengthOf(0);
    });

    it('keeps events and audit rows in separate batches on their own endpoints', async () => {
      analytics.trackEvent('Search Executed', { dataset: 'Document' });
      analytics.auditEvent({ action: 'Post', targetType: 'Project' });
      await analytics.flush();

      const urls = fetchStub.args.map(call => call[0]).sort();
      expect(urls).to.deep.equal([`${AUDIT_URL}/audit`, `${URL}/events`]);
    });

    it('sends nothing for an empty buffer', async () => {
      await analytics.flush();
      expect(fetchStub.called).to.be.false;
    });
  });

  describe('the flush timer', () => {
    it('sends a buffered row once FLUSH_MS has passed', async () => {
      const clock = sinon.useFakeTimers();

      analytics.trackEvent('Document Downloaded', { document_id: 'd1' });
      expect(fetchStub.called, 'sent before the timer fired').to.be.false;

      await clock.tickAsync(5000);

      expect(fetchStub.calledOnce).to.be.true;
      expect(sentBody(fetchStub).events).to.have.lengthOf(1);
    });

    it('schedules a new flush for a row enqueued after the last one fired', async () => {
      const clock = sinon.useFakeTimers();

      analytics.trackEvent('Document Downloaded', { document_id: 'd1' });
      await clock.tickAsync(5000);

      analytics.trackEvent('Document Downloaded', { document_id: 'd2' });
      await clock.tickAsync(5000);

      expect(fetchStub.callCount).to.equal(2);
      expect(sentBody(fetchStub, 1).events[0].properties).to.deep.equal({ document_id: 'd2' });
    });
  });

  describe('envelopes', () => {
    it('wraps events as { events: [...] } stamped with sourceApp eagle-api and no session', async () => {
      analytics.trackEvent('Search Executed', { dataset: 'Document' }, { userId: 'kc-1' });
      await analytics.flush();

      const row = sentBody(fetchStub).events[0];
      expect(row.sourceApp).to.equal('eagle-api');
      expect(row.eventType).to.equal('Search Executed');
      expect(row.userId).to.equal('kc-1');
      expect(row.properties).to.deep.equal({ dataset: 'Document' });
      // A server-side row has no browser session, and inventing one would group unrelated requests.
      expect(row).to.not.have.property('sessionId');
      expect(row.timestamp).to.match(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('wraps audit rows as { rows: [...] } and never claims a SourceIp', async () => {
      analytics.auditEvent({ action: 'Delete', targetType: 'Project', targetId: 'p1' });
      await analytics.flush();

      const body = sentBody(fetchStub);
      expect(body.rows[0]).to.include({ action: 'Delete', targetType: 'Project', sourceApp: 'eagle-api' });
      // The server decides where the call came from; a producer that claimed it would be lying.
      expect(body.rows[0]).to.not.have.property('SourceIp');
      expect(body.rows[0]).to.not.have.property('sourceIp');
    });

    it('sends the key as the APIM subscription key on the audit endpoint', async () => {
      analytics.auditEvent({ action: 'Post' });
      await analytics.flush();

      expect(fetchStub.args[0][1].headers['Ocp-Apim-Subscription-Key']).to.equal(KEY);
      expect(fetchStub.args[0][1].headers).to.not.have.property('X-Api-Key');
    });
  });

  describe('ingest limits', () => {
    it('trims a long free-text value rather than letting it grow the row', async () => {
      analytics.trackEvent('Search Executed', { keywords: 'x'.repeat(600) });
      await analytics.flush();

      expect(sentBody(fetchStub).events[0].properties.keywords).to.have.lengthOf(500);
    });

    it('replaces properties that still exceed the 8000 byte ingest limit', async () => {
      const huge = {};
      for (let i = 0; i < 30; i++) {
        huge[`k${i}`] = 'x'.repeat(500);
      }

      analytics.trackEvent('Search Executed', huge);
      await analytics.flush();

      // The whole batch would be refused over one row, so the row loses its properties instead.
      expect(sentBody(fetchStub).events[0].properties).to.deep.equal({ truncated: true });
    });

    it('replaces an audit detail the ingest API could not parse, and still sends the row', async () => {
      const circular = {};
      circular.self = circular;

      analytics.auditEvent({ action: 'Post', detail: circular });
      await analytics.flush();

      expect(sentBody(fetchStub).rows[0]).to.include({ action: 'Post' });
      expect(sentBody(fetchStub).rows[0].detail).to.deep.equal({ truncated: true });
    });
  });

  describe('auditFromRequest', () => {
    it('takes the actor from the Keycloak payload the middleware attached', async () => {
      analytics.auditFromRequest(argsWith(auth), 'Publish', { type: 'Project', id: 'p1', projectId: 'p1' });
      await analytics.flush();

      expect(sentBody(fetchStub).rows[0]).to.deep.include({
        action: 'Publish',
        actorId: 'kc-1',
        actorName: 'tester',
        actorType: 'staff',
        actorRoles: ['sysadmin', 'staff'],
        targetType: 'Project',
        targetId: 'p1',
        projectId: 'p1'
      });
    });

    it('marks the synthetic public payload as a public actor, not staff', async () => {
      const publicPayload = { preferred_username: 'public', realm_access: { roles: ['public'] } };

      analytics.auditFromRequest(argsWith(publicPayload), 'Post', { type: 'Document', id: 'd1' });
      await analytics.flush();

      expect(sentBody(fetchStub).rows[0].actorType).to.equal('public');
    });

    it('calls an actor with no subject and no roles unknown, not staff', async () => {
      analytics.auditFromRequest({}, 'Delete', { type: 'Project', id: 'p1' });
      await analytics.flush();

      expect(sentBody(fetchStub).rows[0]).to.include({ action: 'Delete', actorType: 'unknown' });
    });
  });

  describe('failure never reaches the caller', () => {
    it('logs the lost audit rows and their actions when the endpoint refuses the batch', async () => {
      fetchStub.resolves({ ok: false, status: 400 });

      analytics.auditEvent({ action: 'Post' });
      analytics.auditEvent({ action: 'Put' });
      await analytics.flush();

      const lost = errorStub.args.find(args => String(args[0]).startsWith('[analytics] lost'));
      expect(lost, `no lost-rows log in ${JSON.stringify(errorStub.args)}`).to.exist;
      expect(lost[0]).to.equal('[analytics] lost 2 audit rows');
      expect(lost[1]).to.deep.equal({ actions: ['Post', 'Put'] });
      expect(analytics._buffers.audit.rows).to.have.lengthOf(0);
    });

    it('says nothing of its own about a refused event batch, which pushClient already logged', async () => {
      fetchStub.resolves({ ok: false, status: 400 });

      analytics.trackEvent('Search Executed', { dataset: 'Document' });
      await analytics.flush();

      expect(errorStub.args.filter(args => String(args[0]).startsWith('[analytics] lost'))).to.be.empty;
      expect(warnStub.args.filter(args => String(args[0]).includes('dropped'))).to.be.empty;
    });

    it('logs rather than rejects when a flush nobody awaited fails', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      const clock = sinon.useFakeTimers();

      analytics.trackEvent('Search Executed', { dataset: 'Document' });
      await clock.tickAsync(5000);

      expect(errorStub.args.map(args => args[0])).to.include('[analytics] 1 events failed');
      expect(analytics._buffers.events.rows).to.have.lengthOf(0);
    });
  });
});
