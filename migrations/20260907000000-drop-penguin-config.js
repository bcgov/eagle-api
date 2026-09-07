'use strict';

// Removes the four penguin-analytics keys from the Config document GET /api/config serves.
//
// penguin-analytics was uninstalled from dev, test and prod on 2026-09-07; the frontends read
// EAGLE_ANALYTICS_URL instead. The Config model no longer declares these paths, so a hydrated
// document drops them on write anyway — this unsets them in the stored document so they stop
// being served in the meantime.
//
// Not the same key as the pod env var ANALYTICS_API_URL (api/helpers/analytics.js,
// helm/eagle-api/values-*.yaml): that one is the eagle-analytics gateway for server-side pushes.
// This migration only touches the Mongo document.
//
// 20260813000000-seed-config.js is left as it was: it transcribes what rproxy served when it ran,
// and it has already run everywhere. This migration follows it, so a freshly seeded environment
// ends up in the same state as an existing one.

const DEAD_KEYS = [
  'ANALYTICS_API_URL',
  'ANALYTICS_DEBUG',
  'ANALYTICS_ENHANCED_TRACKING',
  'ANALYTICS_TRAFFIC_TRACKING'
];

module.exports = {
  async up(db) {
    const unset = {};
    DEAD_KEYS.forEach(function (key) { unset[key] = ''; });

    const result = await db.collection('epic').updateOne(
      { _schemaName: 'Config' },
      { $unset: unset }
    );

    console.log(`Config documents matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  },

  // No down(): the values were environment-specific and are gone from the model, so putting a
  // guessed set back would serve wrong config. Restore from a dump if this has to be undone.
  async down() {
    console.log('Nothing to undo: the penguin-analytics keys are no longer part of the Config model.');
  }
};
