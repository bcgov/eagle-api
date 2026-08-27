/**
 * Unit Tests for Gate Controller
 *
 * POST /api/public/gate is unauthenticated, so the tests that matter are the ones about what it
 * refuses: a wrong password, a missing one, a non-string one, and the environment where no gate
 * is configured at all.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const gateController = require('../../api/controllers/gate');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; }
  };
}

function fakeReq(body) {
  return { body, ip: '10.0.0.7' };
}

describe('Gate Controller', () => {
  const original = process.env.ACCESS_GATE_PASSWORD;

  afterEach(() => {
    sinon.restore();
    if (original === undefined) delete process.env.ACCESS_GATE_PASSWORD;
    else process.env.ACCESS_GATE_PASSWORD = original;
  });

  it('404s when no password is configured, so the route is not advertised', async () => {
    delete process.env.ACCESS_GATE_PASSWORD;
    const res = fakeRes();

    await gateController.publicPost(fakeReq({ password: 'anything' }), res);

    expect(res.statusCode).to.equal(404);
  });

  it('404s when the configured password is empty', async () => {
    process.env.ACCESS_GATE_PASSWORD = '';
    const res = fakeRes();

    await gateController.publicPost(fakeReq({ password: '' }), res);

    expect(res.statusCode).to.equal(404);
  });

  it('204s with no body on a match', async () => {
    process.env.ACCESS_GATE_PASSWORD = 'open-sesame';
    const res = fakeRes();

    await gateController.publicPost(fakeReq({ password: 'open-sesame' }), res);

    expect(res.statusCode).to.equal(204);
    expect(res.ended).to.equal(true);
    expect(res.body).to.equal(null);
  });

  it('401s on a mismatch without echoing the input', async () => {
    process.env.ACCESS_GATE_PASSWORD = 'open-sesame';
    const res = fakeRes();

    await gateController.publicPost(fakeReq({ password: 'guess' }), res);

    expect(res.statusCode).to.equal(401);
    expect(res.body).to.deep.equal({ error: 'Invalid password' });
  });

  it('401s when the body carries no password', async () => {
    process.env.ACCESS_GATE_PASSWORD = 'open-sesame';
    const res = fakeRes();

    await gateController.publicPost(fakeReq({}), res);

    expect(res.statusCode).to.equal(401);
  });

  it('401s on a non-string password instead of throwing', async () => {
    // safeEqual hands its argument to Buffer.from, which throws on a number or an object —
    // a JSON body is attacker-controlled, so the type check has to come first.
    process.env.ACCESS_GATE_PASSWORD = 'open-sesame';

    for (const password of [42, { length: 11 }, ['open-sesame'], true]) {
      const res = fakeRes();
      await gateController.publicPost(fakeReq({ password }), res);
      expect(res.statusCode, `password ${JSON.stringify(password)}`).to.equal(401);
    }
  });

  it('logs a warning with the caller IP, and never the password', async () => {
    process.env.ACCESS_GATE_PASSWORD = 'open-sesame';
    const warn = sinon.stub(winston.loggers.get('default'), 'warn');
    const res = fakeRes();

    await gateController.publicPost(fakeReq({ password: 'guess' }), res);

    expect(warn.calledOnce).to.equal(true);
    const logged = warn.firstCall.args.join(' ');
    expect(logged).to.contain('10.0.0.7');
    expect(logged).to.not.contain('guess');
    expect(logged).to.not.contain('open-sesame');
  });
});
