/**
 * Unit test for 20260907000000-drop-penguin-config.
 *
 * First test in this repo for a migration: there is no in-process Mongo, so the fake below is the
 * smallest thing that can answer the question that matters — after `up`, which keys are still on
 * the stored document. It applies the `$unset` the migration issues to a plain object rather than
 * recording the call, so a migration that unset the wrong field, or the right field on the wrong
 * document, fails here.
 */

const { expect } = require('chai');

const migration = require('../../migrations/20260907000000-drop-penguin-config');

// Enough of the migrate-mongo `db` handle for one updateOne with a $unset. Only documents in the
// named collection that match the filter are touched, so a wrong collection or filter shows up as
// an untouched document.
function fakeDb(collections) {
  return {
    collection(name) {
      const docs = collections[name] || [];
      return {
        async updateOne(filter, update) {
          const matched = docs.filter(doc =>
            Object.keys(filter).every(key => doc[key] === filter[key]));

          matched.forEach(doc => {
            Object.keys(update.$unset || {}).forEach(key => { delete doc[key]; });
          });

          return { matchedCount: matched.length, modifiedCount: matched.length };
        }
      };
    }
  };
}

function storedConfig() {
  return {
    _schemaName: 'Config',
    ENVIRONMENT: 'test',
    API_PATH: '/api',
    SEARCH_API_PATH: '',
    EAGLE_ANALYTICS_URL: 'https://demi-apim-test.azure-api.net/analytics',
    ANALYTICS_API_URL: '/analytics',
    ANALYTICS_DEBUG: true,
    ANALYTICS_ENHANCED_TRACKING: true,
    ANALYTICS_TRAFFIC_TRACKING: true
  };
}

describe('20260907000000-drop-penguin-config', () => {
  it('unsets ANALYTICS_API_URL', async () => {
    const doc = storedConfig();

    await migration.up(fakeDb({ epic: [doc] }));

    expect(doc).to.not.have.property('ANALYTICS_API_URL');
  });

  it('unsets the three penguin tracking flags', async () => {
    const doc = storedConfig();

    await migration.up(fakeDb({ epic: [doc] }));

    expect(doc).to.not.have.property('ANALYTICS_DEBUG');
    expect(doc).to.not.have.property('ANALYTICS_ENHANCED_TRACKING');
    expect(doc).to.not.have.property('ANALYTICS_TRAFFIC_TRACKING');
  });

  it('leaves EAGLE_ANALYTICS_URL in place', async () => {
    // The replacement key. Unsetting it would take browser analytics down with penguin.
    const doc = storedConfig();

    await migration.up(fakeDb({ epic: [doc] }));

    expect(doc).to.have.property('EAGLE_ANALYTICS_URL', 'https://demi-apim-test.azure-api.net/analytics');
  });

  it('leaves the rest of the served configuration alone', async () => {
    const doc = storedConfig();

    await migration.up(fakeDb({ epic: [doc] }));

    expect(doc).to.have.property('ENVIRONMENT', 'test');
    expect(doc).to.have.property('API_PATH', '/api');
    // The documented kill switch, and falsy — an over-broad unset would take it.
    expect(doc).to.have.property('SEARCH_API_PATH', '');
  });

  it('does not touch documents that are not the Config row', async () => {
    const other = { _schemaName: 'Project', ANALYTICS_DEBUG: true };

    await migration.up(fakeDb({ epic: [storedConfig(), other] }));

    expect(other).to.have.property('ANALYTICS_DEBUG', true);
  });

  it('is safe to re-run against a document already cleaned', async () => {
    const doc = { _schemaName: 'Config', ENVIRONMENT: 'test', EAGLE_ANALYTICS_URL: '' };

    await migration.up(fakeDb({ epic: [doc] }));

    expect(doc).to.deep.equal({ _schemaName: 'Config', ENVIRONMENT: 'test', EAGLE_ANALYTICS_URL: '' });
  });
});
