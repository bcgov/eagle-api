/**
 * Express 4 drops a promise returned by a route handler, so a rejected async controller would
 * hang the request instead of reaching the error handler. The router wraps every controller to
 * forward the rejection; this drives the real router over HTTP to prove it.
 */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { expect } = require('chai');

const createRouter = require('../../api/middleware/swagger-router');
const errorHandler = require('../../api/middleware/errorHandler');

// Minimal spec + controller on disk, because the router loads controllers by reading a directory.
const SPEC = {
  paths: {
    '/boom': {
      'x-swagger-router-controller': 'boom',
      get: { operationId: 'rejects', parameters: [], responses: {} }
    }
  }
};

describe('swagger router async controllers', () => {
  let dir;
  let app;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-router-'));
    fs.writeFileSync(
      path.join(dir, 'boom.js'),
      'exports.rejects = async function () { throw new Error("async kaboom"); };\n'
    );

    app = express();
    app.use('/api', createRouter(SPEC, [dir]));
    app.use(errorHandler);
  });

  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('forwards a rejected async controller to the error handler', async () => {
    const res = await request(app).get('/api/boom');

    expect(res.status).to.equal(500);
    expect(res.body).to.deep.equal({ message: 'Internal server error' });
  });
});
