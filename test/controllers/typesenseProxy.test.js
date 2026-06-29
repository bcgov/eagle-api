/**
 * Unit Tests for TypesenseProxy Controller
 *
 * ponytail: Fully mocked unit tests for TypesenseProxy controller to verify role injection, query sanitization, and fetch mock.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const defaultLog = require('winston').loggers.get('default');

// Set environment variables before requiring the controller
process.env.TYPESENSE_HOST = 'test-typesense';
process.env.TYPESENSE_PORT = '8108';
process.env.TYPESENSE_SEARCH_KEY = 'test-search-key';

const typesenseProxy = require('../../api/controllers/typesenseProxy');

describe('TypesenseProxy Controller', () => {
  let res;
  let fetchStub;

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          collection: { value: 'projects' },
          q:          { value: '*' },
          query_by:   { value: 'name' },
          filter_by:  { value: 'region:=Vancouver Island' },
          per_page:   { value: '25' },
          page:       { value: '1' },
          body:       { value: { searches: [{ collection: 'projects', q: '*' }] } },
          auth_payload: {
            realm_access:        { roles: ['sysadmin'] },
            preferred_username:  'testuser'
          },
          ...paramOverrides
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };

    // Stub global fetch
    fetchStub = sinon.stub(global, 'fetch');

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
    sinon.stub(defaultLog, 'warn');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('publicHealth', () => {
    it('returns health state successfully', async () => {
      fetchStub.resolves({
        status: 200,
        json: sinon.stub().resolves({ ok: true })
      });

      await typesenseProxy.publicHealth({}, res);
      expect(fetchStub.calledOnce).to.be.true;
      expect(fetchStub.firstCall.args[0]).to.equal('http://test-typesense:8108/health');
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('returns 503 on fetch failure', async () => {
      fetchStub.rejects(new Error('Network error'));

      await typesenseProxy.publicHealth({}, res);
      expect(res.status.calledWith(503)).to.be.true;
    });
  });

  describe('handleCollectionSearch', () => {
    it('rejects unknown collections', async () => {
      const args = makeArgs({ collection: { value: 'unknown_collection' } });

      await typesenseProxy.publicCollectionSearch(args, res);
      expect(res.status.calledWith(404)).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('injects roles and filters disallowed fields', async () => {
      fetchStub.resolves({
        status: 200,
        json: sinon.stub().resolves({
          hits: [
            { document: { name: 'Proj A', allowed_roles: ['sysadmin', 'public'] } }
          ]
        })
      });

      const args = makeArgs({
        filter_by: { value: 'allowed_roles:=[public] && region:=Vancouver Island' }
      });

      await typesenseProxy.publicCollectionSearch(args, res);

      expect(fetchStub.calledOnce).to.be.true;
      const fetchUrl = fetchStub.firstCall.args[0];
      expect(fetchUrl).to.include('allowed_roles%3A%3D%5Bsysadmin%2Cpublic%5D');
      // allowed_roles should be stripped from client input
      expect(fetchUrl).to.not.include('allowed_roles%3A%3D%5Bpublic%5D');
      expect(fetchUrl).to.include('region%3A%3DVancouver+Island');

      expect(res.status.calledWith(200)).to.be.true;
      const responseData = res.json.firstCall.args[0];
      // Check role stripping from results
      expect(responseData.hits[0].document.allowed_roles).to.be.undefined;
    });

    it('caps per_page parameter at 250', async () => {
      fetchStub.resolves({
        status: 200,
        json: sinon.stub().resolves({ hits: [] })
      });

      const args = makeArgs({ per_page: { value: '500' } });

      await typesenseProxy.publicCollectionSearch(args, res);
      expect(fetchStub.calledOnce).to.be.true;
      expect(fetchStub.firstCall.args[0]).to.include('per_page=250');
    });
  });

  describe('handleMultiSearch', () => {
    it('rejects invalid multi_search body', async () => {
      const args = makeArgs({ body: { value: null } });

      await typesenseProxy.publicMultiSearch(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('rejects multi_search with >10 searches', async () => {
      const searches = Array(11).fill({ collection: 'projects', q: '*' });
      const args = makeArgs({ body: { value: { searches } } });

      await typesenseProxy.publicMultiSearch(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('performs multi_search with correct params and role injection', async () => {
      fetchStub.resolves({
        status: 200,
        json: sinon.stub().resolves({ results: [] })
      });

      const args = makeArgs();
      await typesenseProxy.publicMultiSearch(args, res);

      expect(fetchStub.calledOnce).to.be.true;
      const fetchOptions = fetchStub.firstCall.args[1];
      const parsedBody = JSON.parse(fetchOptions.body);
      expect(parsedBody.searches[0].filter_by).to.equal('allowed_roles:=[sysadmin,public]');
    });
  });
});
