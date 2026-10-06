const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const edgeOnly = require('../../api/middleware/edgeOnly');

const DIRECT_HOST = 'eagle-api-6cdc9e-test.apps.silver.devops.gov.bc.ca';
const FDID = '4216f7df-2a03-4830-9ed1-59ddd0f3d7b5';
const WRONG_FDID = '4216f7df-2a03-4830-9ed1-59ddd0f3d7b6'; // differs only in the last char

function buildApp() {
  const app = express();
  // Same trust setting as app.js, so a forged X-Forwarded-Host would reach req.hostname.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(edgeOnly);
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/public/search', (req, res) => res.json({ ok: true }));
  return app;
}

const search = headers => request(buildApp()).get('/api/public/search').set(headers);

describe('edgeOnly middleware', () => {
  const saved = {};

  beforeEach(() => {
    saved.EDGE_ONLY_HOST = process.env.EDGE_ONLY_HOST;
    saved.FRONT_DOOR_ID = process.env.FRONT_DOOR_ID;
    process.env.EDGE_ONLY_HOST = DIRECT_HOST;
    process.env.FRONT_DOOR_ID = FDID;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('refuses the direct host without X-Azure-FDID', async () => {
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(403);
    expect(res.body).to.deep.equal({ message: 'Forbidden' });
  });

  it('refuses the direct host with a port and mixed case', async () => {
    const res = await search({ Host: `${DIRECT_HOST.toUpperCase()}:443` });
    expect(res.status).to.equal(403);
  });

  it('refuses the direct host with a mismatched X-Azure-FDID', async () => {
    const res = await search({ Host: DIRECT_HOST, 'X-Azure-FDID': WRONG_FDID });
    expect(res.status).to.equal(403);
  });

  it('passes the direct host with the matching X-Azure-FDID', async () => {
    const res = await search({ Host: DIRECT_HOST, 'X-Azure-FDID': FDID });
    expect(res.status).to.equal(200);
  });

  it('judges the Host header, not a forged X-Forwarded-Host', async () => {
    const res = await search({ Host: DIRECT_HOST, 'X-Forwarded-Host': 'eagle-api:3000' });
    expect(res.status).to.equal(403);
  });

  it('exempts /api/health on the direct host', async () => {
    const res = await request(buildApp()).get('/api/health').set({ Host: DIRECT_HOST });
    expect(res.status).to.equal(200);
  });

  it('passes the in-cluster host untouched', async () => {
    const res = await search({ Host: 'eagle-api:3000' });
    expect(res.status).to.equal(200);
  });

  it('passes the console Route host untouched', async () => {
    const res = await search({ Host: 'eagle-test.apps.silver.devops.gov.bc.ca' });
    expect(res.status).to.equal(200);
  });

  it('is off when EDGE_ONLY_HOST is unset', async () => {
    delete process.env.EDGE_ONLY_HOST;
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(200);
  });

  it('is off when FRONT_DOOR_ID is unset', async () => {
    delete process.env.FRONT_DOOR_ID;
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(200);
  });
});
