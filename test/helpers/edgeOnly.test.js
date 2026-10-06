const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const winston = require('winston');
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

// Records what reaches the edge-gate logger's transports, as the console and App Insights see it.
class CaptureTransport extends winston.Transport {
  constructor() {
    super({ level: 'info' });
    this.records = [];
  }

  log(info, callback) {
    this.records.push(info);
    callback();
  }
}

describe('edgeOnly middleware', () => {
  const saved = {};
  const edgeLog = winston.loggers.get('edge-gate');
  let capture;

  beforeEach(() => {
    saved.EDGE_ONLY_HOST = process.env.EDGE_ONLY_HOST;
    saved.FRONT_DOOR_ID = process.env.FRONT_DOOR_ID;
    saved.EDGE_ONLY_MODE = process.env.EDGE_ONLY_MODE;
    process.env.EDGE_ONLY_HOST = DIRECT_HOST;
    process.env.FRONT_DOOR_ID = FDID;
    delete process.env.EDGE_ONLY_MODE;
    capture = new CaptureTransport();
    edgeLog.add(capture);
  });

  afterEach(() => {
    edgeLog.remove(capture);
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

  it('records nothing for /api/health on the direct host', async () => {
    await request(buildApp()).get('/api/health').set({ Host: DIRECT_HOST });
    expect(capture.records).to.have.lengthOf(0);
  });

  it('records nothing when X-Azure-FDID matches', async () => {
    await search({ Host: DIRECT_HOST, 'X-Azure-FDID': FDID });
    expect(capture.records).to.have.lengthOf(0);
  });

  it('records one enforce-mode refusal event when EDGE_ONLY_MODE is unset', async () => {
    await search({ Host: DIRECT_HOST });
    expect(capture.records).to.have.lengthOf(1);
    expect(capture.records[0]).to.include({
      'microsoft.custom_event.name': 'edge-gate-refusal',
      path: '/api/public/search',
      host: DIRECT_HOST,
      mode: 'enforce'
    });
  });

  it('still refuses with EDGE_ONLY_MODE=enforce and records the refusal', async () => {
    process.env.EDGE_ONLY_MODE = 'enforce';
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(403);
    expect(capture.records.map(r => r.mode)).to.deep.equal(['enforce']);
  });

  it('serves the request with EDGE_ONLY_MODE=log', async () => {
    process.env.EDGE_ONLY_MODE = 'log';
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ ok: true });
  });

  it('records one log-mode event with EDGE_ONLY_MODE=log', async () => {
    process.env.EDGE_ONLY_MODE = 'log';
    await search({ Host: DIRECT_HOST });
    expect(capture.records).to.have.lengthOf(1);
    expect(capture.records[0]).to.include({ path: '/api/public/search', mode: 'log' });
  });

  it('puts path, host and mode in the console message', async () => {
    process.env.EDGE_ONLY_MODE = 'log';
    await search({ Host: DIRECT_HOST });
    expect(capture.records[0].message).to.equal(
      `edge-gate: request skipped Front Door path=/api/public/search host=${DIRECT_HOST} mode=log`
    );
  });

  it('keeps the edge-gate console line at info, independent of LOG_LEVEL', () => {
    const consoleTransport = edgeLog.transports.find(t => t instanceof winston.transports.Console);
    expect([edgeLog.level, consoleTransport.level]).to.deep.equal(['info', 'info']);
  });

  it('treats an unknown EDGE_ONLY_MODE as enforce', async () => {
    process.env.EDGE_ONLY_MODE = 'Log';
    const res = await search({ Host: DIRECT_HOST });
    expect(res.status).to.equal(403);
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
