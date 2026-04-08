#!/usr/bin/env node

/**
 * Migration runner — called by Helm pre-upgrade hook or `oc exec`.
 *
 * 1. Seeds migrate-mongo's `changelog` from the legacy db-migrate `migrations`
 *    collection (idempotent — skips if changelog already has entries).
 * 2. Runs all pending migrations via migrate-mongo's programmatic API.
 */

'use strict';

const { database, config, up } = require('migrate-mongo');

const CHANGELOG_COLLECTION = 'changelog';

function buildMongoUri() {
  const host = process.env.MONGODB_SERVICE_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || 27017;
  const db   = process.env.MONGODB_DATABASE || 'epic';
  const user = process.env.MONGODB_USERNAME || '';
  const pass = process.env.MONGODB_PASSWORD || '';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';

  if (user && pass) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}?authSource=${auth}`;
  }
  return `mongodb://${host}:${port}/${db}`;
}

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

async function run() {
  config.set(migrateMongoConfig);
  const { db, client } = await database.connect();

  try {
    await seedChangelog(db);
    const migrated = await up(db, client);
    migrated.forEach(name => console.log('MIGRATED UP:', name));
    if (migrated.length === 0) {
      console.log('All migrations already applied.');
    }
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
