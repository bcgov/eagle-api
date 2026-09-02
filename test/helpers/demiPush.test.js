/**
 * Unit Tests for API Helpers - DEMI Push
 *
 * Testing the dark outbound mirror to demi-api
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');

const demiPush = require('../../api/helpers/demiPush');
const defaultLog = winston.loggers.get('default');

const BASE = 'https://demi-apim-test.example/machine';
const okResponse = () => ({ ok: true, status: 200 });
const failResponse = status => ({ ok: false, status });

describe('DemiPush Helper', () => {
  let fetchStub;
  let errorStub;
  let warnStub;
  let originalBase;
  let originalKey;

  beforeEach(() => {
    originalBase = process.env.DEMI_API_BASE;
    originalKey = process.env.DEMI_APIM_KEY;
    fetchStub = sinon.stub(global, 'fetch');
    errorStub = sinon.stub(defaultLog, 'error');
    warnStub = sinon.stub(defaultLog, 'warn');
  });

  afterEach(() => {
    sinon.restore();
    if (originalBase === undefined) { delete process.env.DEMI_API_BASE; } else { process.env.DEMI_API_BASE = originalBase; }
    if (originalKey === undefined) { delete process.env.DEMI_APIM_KEY; } else { process.env.DEMI_APIM_KEY = originalKey; }
  });

  describe('dark by default', () => {
    it('should not call fetch when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      await demiPush.project({ _id: 'p1', name: 'Test' });
      expect(fetchStub.called).to.be.false;
    });

    it('should not call fetch for documents when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      await demiPush.document({ _id: 'd1' });
      expect(fetchStub.called).to.be.false;
    });

    it('should stay dark and warn once per process when DEMI_APIM_KEY is unset', async () => {
      process.env.DEMI_API_BASE = BASE;
      delete process.env.DEMI_APIM_KEY;

      await demiPush.project({ _id: 'p1' });
      await demiPush.project({ _id: 'p2' });

      expect(fetchStub.called).to.be.false;
      expect(warnStub.calledOnceWith('[demiPush] DEMI_APIM_KEY unset — pushes disabled')).to.be.true;
    });
  });

  describe('when DEMI_API_BASE is set', () => {
    beforeEach(() => {
      process.env.DEMI_API_BASE = BASE;
      process.env.DEMI_APIM_KEY = 'test-key';
    });

    it('should PUT to the APIM eagle project route with the subscription key', async () => {
      fetchStub.resolves(okResponse());
      await demiPush.project({ _id: 'p1', name: 'Test' });

      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      // APIM's backend supplies /api, so a second one here would 404
      expect(url).to.equal(`${BASE}/eagle/projects/p1`);
      expect(options.method).to.equal('PUT');
      expect(options.headers).to.deep.equal({
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': 'test-key'
      });
      expect(JSON.parse(options.body)).to.deep.equal({ doc: { _id: 'p1', name: 'Test' } });
      expect(errorStub.called).to.be.false;
    });

    it('should resolve and log once when fetch throws', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      await demiPush.project({ _id: 'p1' });

      expect(errorStub.calledOnce).to.be.true;
      const [message, meta] = errorStub.firstCall.args;
      expect(message).to.equal('[demiPush] projects p1 failed');
      expect(meta.error).to.equal('ECONNREFUSED');
      expect(meta.stack).to.be.a('string');
    });

    it('should retry once on a 5xx', async () => {
      fetchStub.resolves(failResponse(500));
      await demiPush.project({ _id: 'p1' });

      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.calledOnceWith('[demiPush] projects p1 rejected 500')).to.be.true;
    });

    it('should not retry on a 4xx', async () => {
      fetchStub.resolves(failResponse(404));
      await demiPush.project({ _id: 'p1' });

      expect(fetchStub.callCount).to.equal(1);
      expect(errorStub.calledOnceWith('[demiPush] projects p1 rejected 404')).to.be.true;
    });

    it('should carry resolved List labels in the document body', async () => {
      const findStub = sinon.stub().returns({
        lean: () => Promise.resolve([
          { _id: 'list-type', name: 'Letter' },
          { _id: 'list-milestone', name: 'Application Review' },
          { _id: 'list-phase', name: 'Effects Assessment' },
          { _id: 'list-author', name: 'Proponent' }
        ])
      });
      sinon.stub(mongoose, 'model').withArgs('List').returns({ find: findStub });
      fetchStub.resolves(okResponse());

      await demiPush.document({
        _id: 'd1',
        type: 'list-type',
        milestone: 'list-milestone',
        projectPhase: 'list-phase',
        documentAuthorType: 'list-author'
      });

      expect(findStub.calledOnceWithExactly({ _schemaName: 'List' }, '_id name')).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(`${BASE}/eagle/documents/d1`);
      expect(JSON.parse(options.body).labels).to.deep.equal({
        type: 'Letter',
        milestone: 'Application Review',
        projectPhase: 'Effects Assessment',
        documentAuthorType: 'Proponent'
      });
    });
  });
});
