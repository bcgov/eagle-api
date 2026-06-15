'use strict';

/**
 * Fix projectName on DocumentChunk records.
 *
 * Root cause: old content-extract.js queried projects with { projection: { _id:1, name:1 } }
 * only. EPIC projects store their name in `displayName`, not `name`, so p.name was undefined
 * and DocumentChunk.projectName was never set (or stored as undefined/empty).
 *
 * This script:
 *   1. Queries all Project records to build id → (name || displayName) map
 *   2. Finds all DocumentChunk records with missing/empty projectName
 *   3. Bulk-$set projectName from the map
 *
 * Runs standalone (not via migrate-mongo) — use the npm script:
 *   node migrations/20260526000000-fixChunkProjectNames.js
 *
 * Requires the same env vars as content-extract:
 *   MONGODB_HOST, MONGODB_PORT, MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD
 */

require('dotenv').config();

const { MongoClient } = require('mongodb');

/**
 * Build a MongoDB connection URI from environment variables.
 * (Inlined from eagle-typesense src/config.js — migration must be self-contained.)
 */
function buildMongoUri() {
  const user = encodeURIComponent(process.env.MONGODB_USERNAME || '');
  const pass = encodeURIComponent(process.env.MONGODB_PASSWORD || '');
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const db   = process.env.MONGODB_DATABASE || 'epic';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';
  const replication = process.env.MONGODB_DIRECT === 'true'
    ? 'directConnection=true'
    : 'replicaSet=rs0';

  if (user && pass) {
    return `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=${auth}&${replication}`;
  }
  return `mongodb://${host}:${port}/${db}?${replication}`;
}

async function run() {
  const uri    = buildMongoUri();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db   = client.db();
    const epic = db.collection('epic');

    // ── 1. Build project id → name lookup ────────────────────────────────────
    console.log('Loading projects...');
    const projects = await epic.find(
      { _schemaName: 'Project' },
      { projection: {
        _id: 1, name: 1, displayName: 1,
        currentLegislationYear: 1,
        legislation_2018: 1, legislation_2002: 1, legislation_1996: 1
      }}
    ).toArray();

    const projectMap = new Map();
    for (const p of projects) {
      const legKey = p.currentLegislationYear || 'legislation_2018';
      const leg = p[legKey] || p.legislation_2018 || p.legislation_2002 || p.legislation_1996 || {};
      const resolvedName = leg.name || leg.shortName || p.name || p.displayName || '';
      if (resolvedName) {
        projectMap.set(p._id.toString(), resolvedName);
      }
    }
    console.log(`  Loaded ${projectMap.size} projects with resolved names (out of ${projects.length} total).`);

    // ── 2. Find chunks needing fix ───────────────────────────────────────────
    console.log('Finding DocumentChunk records needing metadata fix...');
    const cursor = epic.find({
      _schemaName: 'DocumentChunk',
      $or: [
        { projectName: { $exists: false } }, { projectName: '' }, { projectName: null },
        { projectId:   { $exists: false } }, { projectId:   '' }, { projectId:   null },
        { documentId:  { $exists: false } }, { documentId:  '' }, { documentId:  null }
      ]
    });

    // ── 3. Bulk update ────────────────────────────────────────────────────────
    console.log('Building and executing bulk update operations...');
    const BATCH = 500;
    let ops = [];
    let done = 0;
    let skipped = 0;

    while (await cursor.hasNext()) {
      const chunk = await cursor.next();
      const pId = (chunk.project || chunk.projectId)?.toString();
      const dId = (chunk.document || chunk.documentId)?.toString();

      const update = {};
      if (pId && projectMap.has(pId)) {
        update.projectName = projectMap.get(pId);
        update.projectId   = pId;
      }
      if (dId) {
        update.documentId = dId;
      }

      if (Object.keys(update).length > 0) {
        ops.push({
          updateOne: {
            filter: { _id: chunk._id },
            update: { $set: update },
          },
        });
      } else {
        skipped++;
      }

      if (ops.length >= BATCH) {
        const result = await epic.bulkWrite(ops, { ordered: false });
        done += result.modifiedCount;
        ops = [];
        process.stdout.write(`  \r  ${done} updated, ${skipped} skipped...`);
      }
    }

    if (ops.length > 0) {
      const result = await epic.bulkWrite(ops, { ordered: false });
      done += result.modifiedCount;
    }

    console.log(`\n\nDone. ${done} DocumentChunk records updated.`);
    console.log('Next step: run typesense-reindex (or partial document_chunks sync) to propagate changes.');

  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
