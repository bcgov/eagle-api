/**
 * The refusals over real HTTP: the actual swagger, the actual router, the actual middleware chain.
 *
 * test/helpers/anonymousRead.test.js checks the declarations and calls the security middleware
 * directly. This drives requests through Express, so a change in how the router assembles its
 * middleware — order, or a stage that swallows the refusal — is caught too.
 *
 * Refusals only. A route that is allowed through reaches its controller and queries MongoDB, which
 * these tests have no connection to; the allow side is covered by the declaration test.
 */
const { expect } = require('chai');
const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const YAML = require('js-yaml');

const createRouter = require('../../api/middleware/swagger-router');

// /audit is deliberately absent: its controller is not loaded, so the router never registers the
// path and it answers 404 rather than 403.
const CLOSED = [
  '/vc',
  '/topic',
  '/jobs',
  '/projectNotification',
  '/comment',
  '/organization/000000000000000000000000'
];

describe('anonymous routing through the real router', () => {
  let app;

  before(() => {
    const spec = YAML.load(
      fs.readFileSync(path.join(__dirname, '../../api/swagger/swagger.yaml'), 'utf8')
    );
    app = express();
    app.use('/api', createRouter(spec, [
      path.join(__dirname, '../../api/controllers'),
      path.join(__dirname, '../../api/tasks')
    ]));
  });

  CLOSED.forEach((route) => {
    it(`refuses GET ${route} without a token`, async () => {
      const res = await request(app).get(`/api${route}`);
      expect(res.status).to.equal(403);
    });
  });

  it('refuses a write without a token', async () => {
    const res = await request(app).post('/api/vc').send({});
    expect(res.status).to.equal(403);
  });
});
