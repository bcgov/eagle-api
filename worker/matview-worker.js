'use strict';

/**
 * Materialized View Worker
 *
 * Standalone entrypoint for running mat-view refreshes as an isolated
 * OpenShift CronJob. Connects directly to MongoDB (no HTTP API call),
 * runs the requested subset, then exits.
 *
 * Env vars:
 *   SUBSET              - hot | cold | all (default: all)
 *   MONGODB_DATABASE_URL - full connection URI (takes priority)
 *   MONGODB_SERVICE_HOST, MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD
 *                       - used to build URI if DATABASE_URL not set
 */

process.on('unhandledRejection', (err) => {
  console.error('[matview-worker] unhandledRejection:', err);
  process.exit(1);
});

async function main() {
  const { loadMongoose, defaultLog } = require('../app_helper');
  const { updateHotViews, updateColdViews, updateAllMaterializedViews } = require('../api/materialized_views/updateViews');

  const subset = (process.env.SUBSET || 'all').toLowerCase();
  if (!['hot', 'cold', 'all'].includes(subset)) {
    console.error(`[matview-worker] invalid SUBSET="${subset}". Must be hot, cold, or all.`);
    process.exit(1);
  }

  defaultLog.info(`[matview-worker] starting: subset=${subset}`);
  const start = Date.now();

  await loadMongoose();

  switch (subset) {
    case 'hot':  await updateHotViews(defaultLog); break;
    case 'cold': await updateColdViews(defaultLog); break;
    default:     await updateAllMaterializedViews(defaultLog); break;
  }

  defaultLog.info(`[matview-worker] finished in ${Date.now() - start}ms`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[matview-worker] fatal error:', err);
  process.exit(1);
});
