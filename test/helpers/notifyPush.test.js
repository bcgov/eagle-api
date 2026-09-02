/**
 * Unit Tests for API Helpers - Notify Push
 *
 * Testing the dark outbound push of published Updates to eagle-notify
 */

const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const notifyPush = require('../../api/helpers/notifyPush');
const defaultLog = winston.loggers.get('default');

const BASE = 'https://eagle-notify-test.azurewebsites.net';
const PROJECT_ID = '507f1f77bcf86cd799439011';
const okResponse = () => ({ ok: true, status: 200 });
const failResponse = status => ({ ok: false, status });

const update = extra => Object.assign({
  _id: '507f1f77bcf86cd799439044',
  project: PROJECT_ID,
  headline: 'Decision issued',
  content: '<p>Hello   <b>world</b></p>'
}, extra);

describe('NotifyPush Helper', () => {
  let fetchStub;
  let errorStub;
  let warnStub;
  let originalBase;
  let originalKey;
  let originalHostname;

  beforeEach(() => {
    originalBase = process.env.NOTIFY_API_BASE;
    originalKey = process.env.NOTIFY_API_KEY;
    originalHostname = process.env.API_HOSTNAME;
    fetchStub = sinon.stub(global, 'fetch');
    errorStub = sinon.stub(defaultLog, 'error');
    warnStub = sinon.stub(defaultLog, 'warn');
  });

  afterEach(() => {
    sinon.restore();
    if (originalBase === undefined) { delete process.env.NOTIFY_API_BASE; } else { process.env.NOTIFY_API_BASE = originalBase; }
    if (originalKey === undefined) { delete process.env.NOTIFY_API_KEY; } else { process.env.NOTIFY_API_KEY = originalKey; }
    if (originalHostname === undefined) { delete process.env.API_HOSTNAME; } else { process.env.API_HOSTNAME = originalHostname; }
  });

  describe('dark by default', () => {
    it('should not call fetch when NOTIFY_API_BASE is unset', async () => {
      delete process.env.NOTIFY_API_BASE;
      await notifyPush.updatePublished(update(), { name: 'Test Project' });
      await notifyPush.updateCancelled(update());
      expect(fetchStub.called).to.be.false;
    });

    it('should stay dark and warn once per process when NOTIFY_API_KEY is unset', async () => {
      process.env.NOTIFY_API_BASE = BASE;
      delete process.env.NOTIFY_API_KEY;

      await notifyPush.updatePublished(update(), null);
      await notifyPush.updatePublished(update(), null);

      expect(fetchStub.called).to.be.false;
      expect(warnStub.calledOnceWith('[notifyPush] NOTIFY_API_KEY unset — pushes disabled')).to.be.true;
    });
  });

  describe('when NOTIFY_API_BASE is set', () => {
    beforeEach(() => {
      process.env.NOTIFY_API_BASE = BASE;
      process.env.NOTIFY_API_KEY = 'test-key';
      process.env.API_HOSTNAME = 'projects.example.ca';
    });

    it('should POST the published event with the functions key', async () => {
      fetchStub.resolves(okResponse());
      expect(await notifyPush.updatePublished(update(), { name: 'Test Project' })).to.be.true;

      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(`${BASE}/api/events`);
      expect(options.method).to.equal('POST');
      expect(options.headers).to.deep.equal({
        'Content-Type': 'application/json',
        'x-functions-key': 'test-key'
      });
      expect(JSON.parse(options.body)).to.deep.equal({
        kind: 'project-updated',
        serviceName: `project:${PROJECT_ID}`,
        title: 'Decision issued',
        url: `https://projects.example.ca/p/${PROJECT_ID}/project-details`,
        projectName: 'Test Project',
        excerpt: 'Hello world',
        idempotencyKey: '507f1f77bcf86cd799439044'
      });
      expect(errorStub.called).to.be.false;
    });

    it('should use the site-wide service name when the Update has no project', async () => {
      fetchStub.resolves(okResponse());
      await notifyPush.updatePublished(update({ project: null }), null);

      const body = JSON.parse(fetchStub.firstCall.args[1].body);
      expect(body.serviceName).to.equal('eao:updates');
      expect(body.projectName).to.be.null;
    });

    it('should bound the excerpt at 500 characters', async () => {
      fetchStub.resolves(okResponse());
      await notifyPush.updatePublished(update({ content: `<p>${'a'.repeat(900)}</p>` }), null);

      expect(JSON.parse(fetchStub.firstCall.args[1].body).excerpt).to.have.lengthOf(500);
    });

    it('should POST a cancelled event without url or excerpt', async () => {
      fetchStub.resolves(okResponse());
      await notifyPush.updateCancelled(update());

      expect(JSON.parse(fetchStub.firstCall.args[1].body)).to.deep.equal({
        kind: 'project-updated',
        serviceName: `project:${PROJECT_ID}`,
        title: 'Decision issued',
        idempotencyKey: '507f1f77bcf86cd799439044',
        cancelled: true
      });
    });

    it('should resolve and log once when fetch throws', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      expect(await notifyPush.updatePublished(update(), null)).to.be.false;

      expect(errorStub.calledOnce).to.be.true;
      const [message, meta] = errorStub.firstCall.args;
      expect(message).to.equal('[notifyPush] event 507f1f77bcf86cd799439044 failed');
      expect(meta.error).to.equal('ECONNREFUSED');
      expect(meta.stack).to.be.a('string');
    });

    it('should retry once on a 5xx', async () => {
      fetchStub.resolves(failResponse(503));
      expect(await notifyPush.updatePublished(update(), null)).to.be.false;

      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.calledOnceWith('[notifyPush] event 507f1f77bcf86cd799439044 rejected 503')).to.be.true;
    });

    it('should not retry on a 4xx', async () => {
      fetchStub.resolves(failResponse(400));
      await notifyPush.updatePublished(update(), null);

      expect(fetchStub.callCount).to.equal(1);
      expect(errorStub.calledOnceWith('[notifyPush] event 507f1f77bcf86cd799439044 rejected 400')).to.be.true;
    });
  });
});
