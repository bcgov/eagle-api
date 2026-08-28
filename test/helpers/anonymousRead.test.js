/**
 * The allow-list itself, read off the real swagger rather than a fixture.
 *
 * Anonymous GETs on Bearer-declared routes used to be granted the 'public' role instead of 403.
 * eagle-public depends on a handful of them, so the fix is a per-operation declaration; this pins
 * exactly which operations carry it. Adding one is a deliberate act and has to fail here first.
 */
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');

const buildSecurityMiddleware = require('../../api/middleware/swagger-security');

const EXPECTED_ANONYMOUS = [
  '/commentperiod',
  '/commentperiod/{commentPeriodId}',
  '/document',
  '/document/{docId}',
  '/document/{docId}/download',
  '/materialized-views/status',
  '/organization',
  '/project',
  '/project/{projId}',
  '/project/{projId}/pin',
  '/search'
];

describe('anonymous read allow-list', () => {
  const spec = YAML.load(
    fs.readFileSync(path.join(__dirname, '../../api/swagger/swagger.yaml'), 'utf8')
  );

  // Every operation that declares Bearer, by path and method.
  const protectedOps = [];
  for (const [apiPath, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'head', 'post', 'put', 'delete']) {
      const op = item[method];
      if (op && Array.isArray(op.security) && op.security.length > 0) {
        protectedOps.push({ apiPath, method, op });
      }
    }
  }

  it('finds the protected operations at all', () => {
    expect(protectedOps.length).to.be.greaterThan(30);
  });

  it('marks exactly the operations eagle-public and demi-admin call without a token', () => {
    const annotated = protectedOps
      .filter(o => o.op['x-anonymous-read'] === true)
      .map(o => o.apiPath)
      .sort();
    expect(annotated).to.eql(EXPECTED_ANONYMOUS);
  });

  it('never marks a write', () => {
    const writes = protectedOps.filter(
      o => o.op['x-anonymous-read'] === true && !['get', 'head'].includes(o.method)
    );
    expect(writes.map(w => `${w.method} ${w.apiPath}`)).to.eql([]);
  });

  // The declaration is only worth having if the middleware acts on it.
  describe('the middleware honours it', () => {
    const run = ({ apiPath, method, op }) => {
      let status;
      // json() must return something truthy: swagger-security reads the return of res.json() as the
      // deny signal, and Express returns res. A mock returning undefined reads as "allowed".
      const res = { status: (code) => { status = code; return res; }, json: () => res };
      const req = {
        headers: {},
        res,
        swagger: { apiPath, operationPath: ['paths', apiPath, method], operation: op, params: {} }
      };
      let passed = false;
      buildSecurityMiddleware(op)(req, req.res, () => { passed = true; });
      return { passed, status, req };
    };

    it('lets an annotated operation through as public', () => {
      const target = protectedOps.find(o => o.apiPath === '/search' && o.method === 'get');
      const { passed, req } = run(target);
      expect(passed).to.be.true;
      expect(req.swagger.params.auth_payload.realm_access.roles).to.eql(['public']);
    });

    it('refuses an unannotated one with 403', () => {
      const target = protectedOps.find(o => o.apiPath === '/vc' && o.method === 'get');
      const { passed, status } = run(target);
      expect(passed).to.be.false;
      expect(status).to.equal(403);
    });
  });
});
