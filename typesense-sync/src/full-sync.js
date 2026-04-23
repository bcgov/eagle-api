'use strict';

/**
 * Full sync: MongoDB → Typesense (zero-downtime using collection aliases).
 *
 * For each schema (Document, Project, Comment):
 *   1. Create a new timestamped collection (e.g. "documents_20260408_020000")
 *   2. Query all public documents from MongoDB and bulk-import in batches
 *   3. Switch the alias (e.g. "documents") to point at the new collection
 *   4. Drop the old collection (if one existed)
 *
 * Run manually:   node typesense-sync/src/full-sync.js
 * Run via cron:   Kubernetes CronJob (helm/typesense/templates/sync-cronjob.yaml)
 *
 * Environment variables:
 *   MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_DATABASE, MONGODB_HOST,
 *   MONGODB_PORT, MONGODB_AUTHSOURCE,
 *   TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_API_KEY
 */

// Load .env when running locally (no-op in production where env vars are injected)
require('dotenv').config();

const { MongoClient } = require('mongodb');
const { getClient }   = require('./typesenseClient');
const { SCHEMAS }     = require('./collections');
const { transformDoc, buildListLookup, buildProjectLookup, buildPcpLookup } = require('./transform');
const { buildMongoUri } = require('./config');

const BATCH_SIZE = 500;

// MongoDB query: only public, non-deleted documents
// Match eagle-api's $redact logic: include docs where read contains 'public',
// OR where read does not exist (eagle-api $$DESCEND behaviour — e.g. project-linked
// RecentActivity docs that predate the read-tagging convention).
const PUBLIC_QUERY = {
  $and: [
    {
      $or: [
        { read: { $in: ['public'] } },
        { read: { $exists: false } },
      ],
    },
    {
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
      ],
    },
  ],
};

async function ensureCollectionExists(typesense, schema) {
  try {
    await typesense.collections(schema.name).retrieve();
  } catch {
    await typesense.collections().create(schema);
    console.log(`Created collection: ${schema.name}`);
  }
}

async function importBatch(typesense, collectionName, docs) {
  if (docs.length === 0) return;
  const results = await typesense
    .collections(collectionName)
    .documents()
    .import(docs, { action: 'upsert' });

  const failures = results.filter(r => !r.success);
  if (failures.length > 0) {
    console.warn(`  ${failures.length} import failures in ${collectionName}:`,
      failures.slice(0, 3).map(f => f.error));
  }
}

async function syncSchema(typesense, mongoDB, listLookup, projectLookup, pcpLookup, schemaName, schema) {
  const timestamp     = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const newCollection = `${schema.name}_${timestamp}`;
  const alias         = schema.name;

  console.log(`\n[${schemaName}] Creating collection: ${newCollection}`);
  await typesense.collections().create({ ...schema, name: newCollection });

  // Find the current alias target (to drop after swap)
  let oldCollection = null;
  try {
    const aliasInfo = await typesense.aliases(alias).retrieve();
    oldCollection   = aliasInfo.collection_name;
  } catch {
    // Alias doesn't exist yet — first run
  }

  // Stream all matching documents from MongoDB and import in batches
  const collection = mongoDB.collection('epic');
  const cursor     = collection.find({ _schemaName: schemaName, ...PUBLIC_QUERY });

  let batch = [];
  let total = 0;

  for await (const doc of cursor) {
    const transformed = transformDoc(schemaName, doc, listLookup, projectLookup, pcpLookup);
    if (transformed) {
      batch.push(transformed);
      if (batch.length >= BATCH_SIZE) {
        await importBatch(typesense, newCollection, batch);
        total += batch.length;
        process.stdout.write(`  Imported ${total}...\r`);
        batch = [];
      }
    }
  }
  if (batch.length > 0) {
    await importBatch(typesense, newCollection, batch);
    total += batch.length;
  }

  console.log(`\n[${schemaName}] Imported ${total} documents into ${newCollection}`);

  // Safety guard: refuse to swap alias if new collection is dramatically smaller
  // than the existing one — catches cases where MongoDB returns partial results.
  if (oldCollection) {
    let oldCount = 0;
    try {
      const oldInfo = await typesense.collections(oldCollection).retrieve();
      oldCount = oldInfo.num_documents || 0;
    } catch {
      // Old collection may not exist yet on first run — that's fine
    }
    if (oldCount > 0 && total < oldCount * 0.8) {
      // Clean up the incomplete new collection before throwing
      try { await typesense.collections(newCollection).delete(); } catch { /* ignore */ }
      throw new Error(
        `[${schemaName}] New collection has ${total} docs but old has ${oldCount}. ` +
        'Refusing to swap alias — too few documents (< 80% of previous). ' +
        'Check MongoDB query and network connectivity.'
      );
    }
  }

  // Swap alias to the new collection
  await typesense.aliases().upsert(alias, { collection_name: newCollection });
  console.log(`[${schemaName}] Alias "${alias}" → "${newCollection}"`);

  // Drop the old collection
  if (oldCollection && oldCollection !== newCollection) {
    try {
      await typesense.collections(oldCollection).delete();
      console.log(`[${schemaName}] Dropped old collection: ${oldCollection}`);
    } catch (err) {
      console.warn(`[${schemaName}] Could not drop old collection ${oldCollection}:`, err.message);
    }
  }
}

async function main() {
  console.log('Starting full sync:', new Date().toISOString());

  const mongoUri = buildMongoUri();
  const mongo    = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const typesense = getClient();

  try {
    await mongo.connect();
    const db = mongo.db(process.env.MONGODB_DATABASE || 'epic');
    console.log('Connected to MongoDB');

    const listLookup = await buildListLookup(db);
    console.log(`List lookup loaded: ${listLookup.size} entries`);

    // Safety guard: List + Organization lookups should resolve hundreds of entries.
    // If the lookup is suspiciously small the MongoDB query likely failed or the
    // schema has no List/Org documents — abort rather than overwrite good data with raw IDs.
    const MIN_LOOKUP_SIZE = 50;
    if (listLookup.size < MIN_LOOKUP_SIZE) {
      throw new Error(
        `List lookup too small (${listLookup.size} entries, expected >= ${MIN_LOOKUP_SIZE}). ` +
        'Aborting sync to protect existing Typesense data. ' +
        'Check MongoDB connectivity and that List/Organization documents exist.'
      );
    }

    const projectLookup = await buildProjectLookup(db);
    console.log(`Project lookup loaded: ${projectLookup.size} entries`);

    const pcpLookup = await buildPcpLookup(db);
    console.log(`PCP lookup loaded: ${pcpLookup.size} entries`);

    for (const [schemaName, schema] of Object.entries(SCHEMAS)) {
      await syncSchema(typesense, db, listLookup, projectLookup, pcpLookup, schemaName, schema);
    }

    console.log('\nFull sync complete:', new Date().toISOString());
  } finally {
    await mongo.close();
  }
}

main().catch(err => {
  console.error('Full sync failed:', err);
  process.exit(1);
});
