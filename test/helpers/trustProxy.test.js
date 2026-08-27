/**
 * Guards how the global rate limiter identifies a caller: `trust proxy` in app.js plus the
 * Front Door key generator. Both must survive a forged X-Forwarded-For. See commit message.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const rateLimitKey = require('../../api/helpers/rateLimitKey');

const CLIENT = '203.0.113.9';   // the real browser
const FORGED = '198.51.100.7';  // whatever an attacker puts in X-Forwarded-For
const AFD_POP = '147.243.1.1';  // an Azure Front Door edge
const ROUTER = '10.1.1.1';      // the OpenShift router, i.e. our socket peer
const FDID = '11111111-2222-3333-4444-555555555555';

/** The `trust proxy` value app.js actually sets, so these cases cannot pass against a config the app does not use. */
function configuredTrustProxy() {
  const source = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  const match = source.match(/app\.set\(\s*['"]trust proxy['"]\s*,\s*(.+?)\s*\)\s*;/);
  expect(match, 'app.js must configure `trust proxy`').to.not.be.null;
  const raw = match[1];
  return /^['"]/.test(raw) ? raw.slice(1, -1) : Number(raw);
}

function buildApp() {
  const app = express();
  app.set('trust proxy', configuredTrustProxy());
  // supertest connects over loopback; pretend the peer is the in-cluster router, as in production.
  app.use((req, res, next) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: ROUTER, configurable: true });
    next();
  });
  app.get('/probe', (req, res) => res.json({ ip: req.ip, key: rateLimitKey(req) }));
  return app;
}

const probe = headers => request(buildApp()).get('/probe').set(headers).expect(200).then(res => res.body);

describe('rate limiter caller identity', () => {
  let previous;

  beforeEach(() => {
    previous = process.env.FRONT_DOOR_ID;
    process.env.FRONT_DOOR_ID = FDID;
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.FRONT_DOOR_ID;
    } else {
      process.env.FRONT_DOOR_ID = previous;
    }
  });

  // browser -> OpenShift router -> rproxy -> here. The router appends the one and only XFF entry.
  it('keys on the client on the direct path', async () => {
    const body = await probe({ 'X-Forwarded-For': CLIENT });
    expect(body.key).to.equal(CLIENT);
  });

  it('ignores an X-Forwarded-For entry the client prepended on the direct path', async () => {
    const body = await probe({ 'X-Forwarded-For': `${FORGED}, ${CLIENT}` });
    expect(body.key).to.equal(CLIENT);
    expect(body.key).to.not.equal(FORGED);
  });

  // browser -> Front Door -> OpenShift router -> rproxy -> here. req.ip is the POP, so the key
  // comes from X-Azure-ClientIP.
  it('keys on the client through Front Door', async () => {
    const body = await probe({
      'X-Forwarded-For': `${CLIENT}, ${AFD_POP}`,
      'X-Azure-FDID': FDID,
      'X-Azure-ClientIP': CLIENT
    });
    expect(body.ip).to.equal(AFD_POP);
    expect(body.key).to.equal(CLIENT);
  });

  it('ignores Front Door headers when X-Azure-FDID is not our profile', async () => {
    const body = await probe({
      'X-Forwarded-For': CLIENT,
      'X-Azure-FDID': 'not-our-profile',
      'X-Azure-ClientIP': FORGED
    });
    expect(body.key).to.equal(CLIENT);
    expect(body.key).to.not.equal(FORGED);
  });

  it('falls back to req.ip when FRONT_DOOR_ID is unset', async () => {
    delete process.env.FRONT_DOOR_ID;
    const body = await probe({
      'X-Forwarded-For': `${CLIENT}, ${AFD_POP}`,
      'X-Azure-FDID': FDID,
      'X-Azure-ClientIP': CLIENT
    });
    expect(body.key).to.equal(AFD_POP);
  });
});
