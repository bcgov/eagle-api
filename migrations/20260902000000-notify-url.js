'use strict';

// Adds NOTIFY_URL to the Config document that GET /api/config serves. Only test has an
// eagle-notify site today; dev and prod get '', which leaves the feature off in eagle-public.

const NOTIFY_URLS = {
  dev: '',
  test: 'https://notifywebtestvymaysch2ag.z9.web.core.windows.net',
  prod: ''
};

// Same resolution as 20260813000000-seed-config.js: API_HOSTNAME reaches the pod through the
// eagle-api ConfigMap, and an unrecognised value throws rather than guessing an environment.
function resolveEnvironment() {
  const host = process.env.API_HOSTNAME || '';
  if (host.startsWith('projects.eao.gov.bc.ca')) return 'prod';
  if (host.startsWith('eagle-test.')) return 'test';
  if (host.startsWith('eagle-dev.')) return 'dev';
  throw new Error(
    `Cannot set NOTIFY_URL: API_HOSTNAME is '${host || 'unset'}'. Set it to the environment being ` +
    'migrated (locally: API_HOSTNAME=eagle-dev.apps.silver.devops.gov.bc.ca).'
  );
}

module.exports = {
  async up(db) {
    const name = resolveEnvironment();
    // $exists guard, not a blind $set: an operator who has already tuned NOTIFY_URL keeps it.
    const result = await db.collection('epic').updateOne(
      { _schemaName: 'Config', NOTIFY_URL: { $exists: false } },
      { $set: { NOTIFY_URL: NOTIFY_URLS[name] } }
    );
    console.log(`NOTIFY_URL for '${name}': ${result.modifiedCount} document(s) updated.`);
  },

  async down(db) {
    await db.collection('epic').updateOne(
      { _schemaName: 'Config' },
      { $unset: { NOTIFY_URL: '' } }
    );
  }
};
