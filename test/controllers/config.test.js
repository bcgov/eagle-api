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
    require('../../api/helpers/models/config');
    const Config = mongoose.model('Config');
    const partial = Config.hydrate({ _schemaName: 'Config', ENVIRONMENT: 'test' });
    sinon.stub(mongoose, 'model').withArgs('Config').returns({
      findOne: () => Promise.resolve(partial)
    });
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.body).to.have.property('ADMIN_PATH', '/admin/');
    expect(res.body).to.have.property('KEYCLOAK_ENABLED', true);
  });

  it('404s when the document is missing rather than serving an empty config', async () => {
    stubConfigModel(null);
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.statusCode).to.equal(404);
  });

  it('500s when the read fails', async () => {
    stubConfigModel(null, new Error('connection lost'));
    const res = fakeRes();

    await configController.publicGet({}, res);

    expect(res.statusCode).to.equal(500);
    expect(res.body).to.not.have.property('stack');
  });
});
