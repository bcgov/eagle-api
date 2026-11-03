#!/usr/bin/env node

// Run by the Helm pre-upgrade hook and `oc exec`. migrate-mongo v14 is ESM-only and its CJS shim
// is a broken Proxy, so run() loads it with dynamic import().

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

// Pre-2026 migrations reshape data a fresh database lacks, and many call driver APIs the installed
// driver lacks, so a fresh DB marks them applied instead of running them.
async function baselineFreshDb(db, fileNames) {
  const changelogCount = await db.collection(CHANGELOG_COLLECTION).countDocuments();
  if (changelogCount > 0) {
    console.log(`baseline skipped: changelog has ${changelogCount} rows`);
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
