// Refusals over real HTTP through the real router, so middleware order is caught; anonymousRead.test.js
// covers the declarations. Refusals only: an allowed route would query MongoDB, which is not connected.
const { expect } = require('chai');
const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const YAML = require('js-yaml');

const createRouter = require('../../api/middleware/swagger-router');

const CLOSED = [
  '/jobs/000000000000000000000000',
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
    app.use('/api', createRouter(spec, [path.join(__dirname, '../../api/controllers')]));
  });

  CLOSED.forEach((route) => {
    it(`refuses GET ${route} without a token`, async () => {
      const res = await request(app).get(`/api${route}`);
      expect(res.status).to.equal(403);
    });
  });

  it('refuses a write without a token', async () => {
    const res = await request(app).post('/api/project').send({});
    expect(res.status).to.equal(403);
  });

  // A 404 here means the path, operationId and controller export do not match.
  it('refuses POST /document/stored without a token', async () => {
    const res = await request(app).post('/api/document/stored').send({});
    expect(res.status).to.equal(403);
  });
});
