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

const configController = require('../../api/controllers/config');

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
});
