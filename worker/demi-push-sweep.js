'use strict';

/**
 * DEMI push sweep worker
 *
 * Standalone entrypoint for the eagle-cron-demi-sweep CronJob. Connects to MongoDB, re-pushes the
 * rows flagged demiPushPending and resends the hard deletes kept in demi_push_tombstones
 * (api/helpers/demiPushSweep.js), then exits: 1 when either could not be read, 0 otherwise. A push
 * that failed again stays flagged or kept for the next run.
 *
 * Env vars: the Mongo ones matview-worker.js reads, plus DEMI_API_BASE, DEMI_APIM_KEY and
 * DEMI_PUSH_OPT_IN_KINDS. Without DEMI_API_BASE and DEMI_APIM_KEY it pushes nothing.
 */

const { loadMongoose, defaultLog } = require('../app_helper');

process.on('unhandledRejection', (err) => {
  defaultLog.error('[demi-push-sweep] unhandledRejection', { error: err && err.message });
  process.exit(1);
});

async function main() {
  const pushClient = require('../api/helpers/pushClient');
  const { sweep } = require('../api/helpers/demiPushSweep');

  try {
    await loadMongoose();
  } catch (err) {
    defaultLog.error('[demi-push-sweep] MongoDB connection failed', { error: err.message });
    process.exit(1);
  }
  const summary = await sweep();
  pushClient.logUnsent();
  process.exit(Object.values(summary).some(counts => counts.unreadable) ? 1 : 0);
}

main();
