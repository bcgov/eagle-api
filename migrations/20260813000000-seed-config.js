'use strict';

// Seeds the single Config document that GET /api/config serves.
//
// These values are a transcription of what rproxy's ConfigMap renders today
// (eao-nginx/helm/rproxy/templates/configmap.yaml, values-{dev,test,prod}.yaml). Cutover is only
// safe once the served payload matches the ConfigMap key for key — diff them before deleting the
// `location = /api/config` block from eao-nginx, because that exact-match block wins over the
// /api proxy and hides any discrepancy until it is removed.
//
// Three ConfigMap keys are deliberately NOT seeded: API_LOCATION (the frontend bootstraps from
// env.js and a served value would fight it), KEYCLOAK_CLIENT_ID (eagle-admin overrides it locally,
// eagle-public has no Keycloak) and ENGAGE_API_URL (zero consumers in either frontend).

const COMMON = {
  _schemaName: 'Config',
  API_PATH: '/api',
  ADMIN_PATH: '/admin/',
  KEYCLOAK_REALM: 'eao-epic',
  KEYCLOAK_ENABLED: true,
  ANALYTICS_API_URL: '/analytics',
  ANALYTICS_ENHANCED_TRACKING: true,
  ANALYTICS_TRAFFIC_TRACKING: true,
  SURVEY_URL: null,
  SHOW_SURVEY_BANNER: false
};

const ENVIRONMENTS = {
  dev: Object.assign({}, COMMON, {
    ENVIRONMENT: 'dev',
    BANNER_COLOUR: 'red',
    LOG_LEVEL: 0,
    // Only dev has a search service; test and prod render this empty, which is the documented
    // kill switch back to eagle-api.
    SEARCH_API_PATH: '/eagle-search',
    KEYCLOAK_URL: 'https://dev.loginproxy.gov.bc.ca/auth',
    ANALYTICS_DEBUG: true
  }),
  test: Object.assign({}, COMMON, {
    ENVIRONMENT: 'test',
    BANNER_COLOUR: 'orange',
    LOG_LEVEL: 0,
    SEARCH_API_PATH: '',
    KEYCLOAK_URL: 'https://test.loginproxy.gov.bc.ca/auth',
    ANALYTICS_DEBUG: true
  }),
  prod: Object.assign({}, COMMON, {
    ENVIRONMENT: 'prod',
    BANNER_COLOUR: '',
    LOG_LEVEL: 4,
    SEARCH_API_PATH: '',
    KEYCLOAK_URL: 'https://loginproxy.gov.bc.ca/auth',
    ANALYTICS_DEBUG: false
  })
};

// API_HOSTNAME reaches the pod through the eagle-api ConfigMap (helm/eagle-api/values-*.yaml,
// mounted by `envFrom` in templates/deployment.yaml). An unrecognised value throws rather than
// falling back: the seed runs once and the `existing` guard stops a later run from repairing it,
// so a wrong guess in prod is a wrong document forever, and a silent one.
function resolveEnvironment() {
  const host = process.env.API_HOSTNAME || '';
  if (host.startsWith('projects.eao.gov.bc.ca')) return 'prod';
  if (host.startsWith('eagle-test.')) return 'test';
  if (host.startsWith('eagle-dev.')) return 'dev';
  throw new Error(
    `Cannot seed Config: API_HOSTNAME is '${host || 'unset'}'. Set it to the environment being ` +
    'migrated (locally: API_HOSTNAME=eagle-dev.apps.silver.devops.gov.bc.ca).'
  );
}

module.exports = {
  async up(db) {
    const epicCollection = db.collection('epic');
    const name = resolveEnvironment();
    const doc = ENVIRONMENTS[name];

    const existing = await epicCollection.findOne({ _schemaName: 'Config' });
    if (existing) {
      console.log(`Config document already exists (${existing.ENVIRONMENT}); leaving it alone.`);
      return;
    }

    await epicCollection.insertOne(doc);
    console.log(`Inserted Config document for '${name}' (API_HOSTNAME=${process.env.API_HOSTNAME || 'unset'})`);
  },

  async down(db) {
    const epicCollection = db.collection('epic');
    await epicCollection.deleteMany({ _schemaName: 'Config' });
  }
};
