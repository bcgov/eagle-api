#!/usr/bin/env node

/**
 * Migration runner — called by Helm pre-upgrade hook or `oc exec`.
 *
 * 1. Seeds migrate-mongo's `changelog` from the legacy db-migrate `migrations`
 *    collection (idempotent — skips if changelog already has entries).
 * 2. On a fresh database (no changelog, no legacy collection, empty `epic`), marks the pre-2026
 *    migrations applied and creates the text index they would have built (see baselineFreshDb).
 * 3. Runs all pending migrations via migrate-mongo's programmatic API.
 *
 * Note: migrate-mongo v14 is ESM-only. Its CJS shim is a broken Proxy, so we
 * must use dynamic import() to load it correctly.
 */

'use strict';

const fs = require('fs');

const CHANGELOG_COLLECTION = 'changelog';
const BASELINE_BEFORE = '20260101000000';

const { buildMongoUri } = require('./config/mongo_uri');

const migrateMongoConfig = {
  mongodb: { url: buildMongoUri(), options: {} },
  migrationsDir: 'migrations',
  changelogCollectionName: CHANGELOG_COLLECTION,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs'
};

async function seedChangelog(db) {
  const changelogCol = db.collection(CHANGELOG_COLLECTION);
  const migrationsCol = db.collection('migrations');

  const changelogCount = await changelogCol.countDocuments();
  if (changelogCount > 0) {
    console.log(`changelog already has ${changelogCount} entries — skipping seed.`);
    return;
  }

  const legacyDocs = await migrationsCol.find().toArray();
  if (legacyDocs.length === 0) {
    console.log('No legacy migrations collection — nothing to seed.');
    return;
  }

  // db-migrate:    { name: "/20190109233701-centroidCreation", run_on: ISODate }
  // migrate-mongo: { fileName: "20190109233701-centroidCreation.js", appliedAt: ISODate }
  const docs = legacyDocs.map(doc => ({
    fileName: doc.name.replace(/^\//, '') + '.js',
    appliedAt: doc.run_on
  }));

  await changelogCol.insertMany(docs);
  console.log(`Seeded ${docs.length} entries into changelog from legacy migrations collection.`);
}

// Pre-2026 migrations reshape data that a fresh database does not hold, and many call driver APIs
// that no longer exist, so they cannot run on an empty local DB.
async function baselineFreshDb(db, fileNames) {
  const changelogCount = await db.collection(CHANGELOG_COLLECTION).countDocuments();
  if (changelogCount > 0) {
    console.log(`baseline skipped: changelog has ${changelogCount} rows`);
    return;
  }
  if (await db.collection('migrations').countDocuments() > 0) {
    console.log('baseline skipped: legacy migrations collection has rows');
    return;
  }
  if (await db.collection('epic').countDocuments({}, { limit: 1 }) > 0) {
    console.log('baseline skipped: epic has docs');
    return;
  }

  // Index before changelog rows: a failure here leaves the changelog empty, so the next run retries.
  await db.collection('epic').createIndex({ '$**': 'text' }, { name: 'localBaselineText' });

  const appliedAt = new Date();
  const rows = fileNames
    .filter(name => /^\d{14}-.+\.js$/.test(name) && name.slice(0, 14) < BASELINE_BEFORE)
    .sort()
    .map(fileName => ({ fileName, appliedAt }));
  await db.collection(CHANGELOG_COLLECTION).insertMany(rows);
  console.log(`baseline: marked ${rows.length} pre-2026 migrations applied`);
}

async function run() {
  const { database, config, up } = await import('migrate-mongo');
  config.set(migrateMongoConfig);
  const { db, client } = await database.connect();

  try {
    await seedChangelog(db);
    await baselineFreshDb(db, fs.readdirSync(migrateMongoConfig.migrationsDir));
    const migrated = await up(db, client);
    migrated.forEach(name => console.log('MIGRATED UP:', name));
    if (migrated.length === 0) {
      console.log('All migrations already applied.');
    }
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = { baselineFreshDb };
