/**
 * Unit Tests for the `trust proxy` setting
 *
 * This is a rate-limiting correctness test, not a style check. express-rate-limit keys its buckets
 * on `req.ip`, and `req.ip` is whatever proxy-addr returns for the configured number of trusted
 * hops. Get the number wrong and every request arriving through Azure Front Door keys on a handful
 * of AFD POP addresses instead of on real clients, so the entire site shares one bucket and trips
 * 429 under normal load.
 *
 * The value is READ OUT OF app.js rather than restated here. That is deliberate: a test that
 * declares its own expected value would pass no matter what the application is actually configured
 * to do. Change app.js back to 1 and the "through Front Door" case below goes red.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const proxyaddr = require('proxy-addr');

// Two hosts we can assert on by identity. The values are arbitrary documentation IPs; what matters
// is only that they are distinguishable from each other.
const CLIENT = '203.0.113.9';   // the real browser
const AFD_EDGE = '147.243.1.1'; // an Azure Front Door POP
const ROUTER = '10.1.1.1';      // the OpenShift router, i.e. our socket peer

/** The `trust proxy` value the application actually sets, parsed from source. */
function configuredTrustProxy() {
  const source = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  const match = source.match(/app\.set\(\s*['"]trust proxy['"]\s*,\s*(\d+)\s*\)/);
  expect(match, 'app.js must configure a numeric `trust proxy`').to.not.be.null;
  return parseInt(match[1], 10);
}

/**
 * express's own numeric-trust compiler: trust the first `n` hops back from the socket.
 * Mirrors lib/utils.js compileTrust(number).
 */
const trustFn = n => (addr, i) => i < n;

/** Resolve req.ip the way express would, for a given X-Forwarded-For chain. */
function resolveClientIp(forwardedFor, trust) {
  const req = {
    connection: { remoteAddress: ROUTER },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}
  };
  return proxyaddr(req, trustFn(trust));
}

describe('trust proxy', () => {
  it('is configured as a number', () => {
    expect(configuredTrustProxy()).to.be.a('number').and.be.at.least(1);
  });

  // browser -> OpenShift router -> rproxy -> here.  XFF carries one address.
  it('resolves the real client IP on the direct OpenShift path', () => {
    expect(resolveClientIp(CLIENT, configuredTrustProxy())).to.equal(CLIENT);
  });

  // browser -> Azure Front Door -> OpenShift router -> rproxy -> here.  XFF carries two.
  // This is the case that fails at `trust proxy` 1, and it fails by returning the AFD edge.
  it('resolves the real client IP when the request comes through Front Door', () => {
    const ip = resolveClientIp(`${CLIENT}, ${AFD_EDGE}`, configuredTrustProxy());
    expect(ip).to.equal(CLIENT);
    expect(ip).to.not.equal(AFD_EDGE);
  });

  // Guards the other direction: trusting more hops than exist lets a client forge its own source
  // address by sending an X-Forwarded-For header, which would let anyone evade the rate limiter.
  it('does not trust an address a client can forge', () => {
    const spoofed = '198.51.100.7';
    const ip = resolveClientIp(`${spoofed}, ${CLIENT}, ${AFD_EDGE}`, configuredTrustProxy());
    expect(ip).to.not.equal(spoofed);
  });
});
