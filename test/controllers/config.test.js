/**
 * Unit Tests for Config Controller
 *
 * GET /api/config is unauthenticated and world-readable, so the tests that matter are the ones
 * about what it refuses to serve, and about falsy values surviving — SEARCH_API_PATH: '' is the
 * documented kill switch back to eagle-api, and a truthy filter would silently drop it.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const demiPush = require('../../api/helpers/demiPush');

const CONFIG_CONTROLLER_PATH = require.resolve('../../api/controllers/config');
const configController = require(CONFIG_CONTROLLER_PATH);

// Minimal stand-in for the Express response the controller is handed.
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

// mongoose.model('Config') -> findOne(...) -> resolves `doc`
function stubConfigModel(doc, err) {
  return sinon.stub(mongoose, 'model').withArgs('Config').returns({
    findOne: () => (err ? Promise.reject(err) : Promise.resolve(doc))
  });
}

// Hydrates `fields` through the real schema (so unset paths pick up their declared defaults),
// then stubs findOne() to resolve the hydrated doc.
function stubHydratedConfig(fields) {
  require('../../api/helpers/models/config');
  const Config = mongoose.model('Config');
  const partial = Config.hydrate(fields);
  return sinon.stub(mongoose, 'model').withArgs('Config').returns({
    findOne: () => Promise.resolve(partial)
  });
}

describe('Config Controller', () => {
  // Every GET can mirror to DEMI, so the push is stubbed for the whole file rather than left to
  // reach the network on whichever environment variables the runner happens to carry.
  beforeEach(() => sinon.stub(demiPush, 'config').resolves(true));

  afterEach(() => sinon.restore());

  it('serves the stored configuration', async () => {
    stubConfigModel({ _schemaName: 'Config', ENVIRONMENT: 'test', BANNER_COLOUR: 'orange' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.statusCode).to.equal(200);
    expect(res.body.ENVIRONMENT).to.equal('test');
    expect(res.body.BANNER_COLOUR).to.equal('orange');
  });

  it('preserves falsy values instead of dropping them', async () => {
    stubConfigModel({
      _schemaName: 'Config',
      SEARCH_API_PATH: '',        // the kill switch — must survive
      SHOW_SURVEY_BANNER: false,
      LOG_LEVEL: 0,
      SURVEY_URL: null
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('SEARCH_API_PATH', '');
    expect(res.body).to.have.property('SHOW_SURVEY_BANNER', false);
    expect(res.body).to.have.property('LOG_LEVEL', 0);
    expect(res.body).to.have.property('SURVEY_URL', null);
  });

  it('serves DEMI_PROJECTS_PATH when the row sets it', async () => {
    stubConfigModel({ _schemaName: 'Config', ENVIRONMENT: 'test', DEMI_PROJECTS_PATH: '/demi-projects' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('DEMI_PROJECTS_PATH', '/demi-projects');
  });

  it('defaults DEMI_PROJECTS_PATH to an empty string when the row has no opinion on it', async () => {
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('DEMI_PROJECTS_PATH', '');
  });

  it('serves EAGLE_ANALYTICS_URL', async () => {
    stubConfigModel({
      _schemaName: 'Config',
      ENVIRONMENT: 'test',
      EAGLE_ANALYTICS_URL: 'https://demi-apim-test.azure-api.net/analytics'
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('EAGLE_ANALYTICS_URL', 'https://demi-apim-test.azure-api.net/analytics');
  });

  it('serves the three penguin tracking keys nowhere, even when the stored document carries them', async () => {
    // penguin-analytics was uninstalled on 2026-09-07 and these keys dropped from the model.
    // 20260907000000-drop-penguin-config unsets them, but an environment that has not run it yet
    // must not have them served back to browsers.
    stubConfigModel({
      _schemaName: 'Config',
      ENVIRONMENT: 'test',
      ANALYTICS_DEBUG: true,
      ANALYTICS_ENHANCED_TRACKING: true,
      ANALYTICS_TRAFFIC_TRACKING: true
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.not.have.property('ANALYTICS_DEBUG');
    expect(res.body).to.not.have.property('ANALYTICS_ENHANCED_TRACKING');
    expect(res.body).to.not.have.property('ANALYTICS_TRAFFIC_TRACKING');
  });

  it('serves ANALYTICS_API_URL as an empty string when the document has no such field', async () => {
    // The frontends merge this payload over env.js with a shallow spread and env.js bakes
    // '/analytics'. An absent key leaves the retired penguin client switched on in the browser,
    // so '' has to be present, not merely unset.
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('ANALYTICS_API_URL', '');
  });

  it('serves ANALYTICS_API_URL as empty even when the document sets a value', async () => {
    // It is a constant in the controller, not a config key — no Mongo row can switch penguin on.
    stubConfigModel({ _schemaName: 'Config', ENVIRONMENT: 'test', ANALYTICS_API_URL: '/analytics' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('ANALYTICS_API_URL', '');
  });

  it('defaults EAGLE_ANALYTICS_URL to an empty string when the row has no opinion on it', async () => {
    // Empty is the off switch for the new client, so it must reach the payload rather than go missing.
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('EAGLE_ANALYTICS_URL', '');
  });

  it('serves no key outside the public allowlist', async () => {
    stubConfigModel({
      _schemaName: 'Config',
      _id: 'abc123',
      ENVIRONMENT: 'test',
      MONGODB_PASSWORD: 'hunter2',   // an operator pasting a secret into the collection
      API_LOCATION: 'https://example.com',
      KEYCLOAK_CLIENT_ID: 'eagle-api-console'
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.not.have.property('MONGODB_PASSWORD');
    expect(res.body).to.not.have.property('_id');
    expect(res.body).to.not.have.property('_schemaName');
    // Both are ConfigMap keys we deliberately stopped serving.
    expect(res.body).to.not.have.property('API_LOCATION');
    expect(res.body).to.not.have.property('KEYCLOAK_CLIENT_ID');
  });

  it('fills a key the stored document is missing from the schema default', async () => {
    // The reason this controller does not use .lean(): a key added to the model later must answer
    // with its declared default rather than disappear from the payload until someone backfills it.
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('ADMIN_PATH', '/admin/');
    expect(res.body).to.have.property('KEYCLOAK_ENABLED', true);
    // Off unless an environment turns it on by hand.
    expect(res.body).to.have.property('ACCESS_GATE', false);
  });

  it('serves ACCESS_GATE when the row sets it true', async () => {
    stubConfigModel({ _schemaName: 'Config', ENVIRONMENT: 'test', ACCESS_GATE: true });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('ACCESS_GATE', true);
  });

  it('serves APPINSIGHTS_CONNECTION_STRING when the row sets it', async () => {
    stubConfigModel({
      _schemaName: 'Config',
      ENVIRONMENT: 'test',
      APPINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://example.in.applicationinsights.azure.com/'
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body.APPINSIGHTS_CONNECTION_STRING).to.contain('IngestionEndpoint=');
  });

  it('serves an empty APPINSIGHTS_CONNECTION_STRING when the row has no opinion on it', async () => {
    // Empty is the off switch: the SPAs skip loading the browser SDK, so the default must reach
    // the payload as '' rather than going missing.
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('APPINSIGHTS_CONNECTION_STRING', '');
  });

  it('serves CONTENT_SEARCH when the row sets it true', async () => {
    stubConfigModel({ _schemaName: 'Config', ENVIRONMENT: 'test', CONTENT_SEARCH: true });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('CONTENT_SEARCH', true);
  });

  it('does not gain CONTENT_SEARCH when the row has no opinion on it', async () => {
    // Hydrated through the real schema (like the "fills a key" test above) so this also proves
    // the model declares no default for CONTENT_SEARCH — a default would leak it into every payload.
    stubHydratedConfig({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.not.have.property('CONTENT_SEARCH');
  });

  it('404s when the document is missing rather than serving an empty config', async () => {
    stubConfigModel(null);
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.statusCode).to.equal(404);
  });

  it('does not let the 404 be cached', async () => {
    // app.js has already stamped max-age=60 on this unauthenticated GET by the time the
    // controller runs — a missing config must not stick in rproxy for a minute.
    stubConfigModel(null);
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.headers['Cache-Control']).to.equal('no-store');
  });

  it('500s when the read fails', async () => {
    stubConfigModel(null, new Error('connection lost'));
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.statusCode).to.equal(500);
    expect(res.body).to.not.have.property('stack');
  });

  it('does not let the 500 be cached', async () => {
    stubConfigModel(null, new Error('connection lost'));
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.headers['Cache-Control']).to.equal('no-store');
  });

  // Config has no write controller, so the read path is the only place a hand edit in Mongo can be
  // noticed. The pushed-hash lives in module scope, so each test gets its own copy of the module.
  describe('DEMI mirror', () => {
    let controller;
    let stored;

    beforeEach(() => {
      delete require.cache[CONFIG_CONTROLLER_PATH];
      controller = require(CONFIG_CONTROLLER_PATH);
      stored = { _schemaName: 'Config', ENVIRONMENT: 'test', BANNER_COLOUR: 'orange' };
      sinon.stub(mongoose, 'model').withArgs('Config').returns({
        findOne: () => Promise.resolve(stored)
      });
    });

    const get = async () => {
      const res = fakeRes();
      await controller.publicGet({}, res);
      return res;
    };

    it('pushes the served payload to DEMI on the first read after boot', async () => {
      const res = await get();

      expect(res.statusCode).to.equal(200);
      expect(demiPush.config.calledOnce).to.be.true;
      // exactly what the caller got, shim included
      expect(demiPush.config.firstCall.args).to.deep.equal([res.body]);
      expect(res.body).to.have.property('ANALYTICS_API_URL', '');
    });

    it('does not push again when the next read serves the same payload', async () => {
      await get();
      await get();
      await get();

      expect(demiPush.config.callCount).to.equal(1);
    });

    it('pushes again once the stored configuration changes', async () => {
      await get();
      stored.BANNER_COLOUR = 'red';
      const res = await get();

      expect(demiPush.config.callCount).to.equal(2);
      expect(demiPush.config.secondCall.args[0]).to.have.property('BANNER_COLOUR', 'red');
      expect(res.body).to.have.property('BANNER_COLOUR', 'red');
    });

    it('pushes again when a key is removed rather than changed', async () => {
      await get();
      delete stored.BANNER_COLOUR;
      await get();

      expect(demiPush.config.callCount).to.equal(2);
      expect(demiPush.config.secondCall.args[0]).to.not.have.property('BANNER_COLOUR');
    });

    it('still serves 200 when the push reports it did not land', async () => {
      demiPush.config.resolves(false);
      const res = await get();

      expect(res.statusCode).to.equal(200);
      expect(res.body).to.have.property('ENVIRONMENT', 'test');
    });

    it('answers without waiting for the push to finish', async () => {
      // A push that never settles: an awaited call would hang this test out to the mocha timeout.
      demiPush.config.returns(new Promise(() => {}));
      const res = await get();

      expect(res.statusCode).to.equal(200);
    });

    it('pushes nothing when there is no Config document to serve', async () => {
      stored = null;
      const res = await get();

      expect(res.statusCode).to.equal(404);
      expect(demiPush.config.called).to.be.false;
    });
  });
});
