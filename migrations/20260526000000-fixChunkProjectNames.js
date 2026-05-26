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
const { buildMongoUri } = require('../typesense-sync/src/config');

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
      { projection: { _id: 1, name: 1, displayName: 1 } }
    ).toArray();

    const projectMap = new Map();
    for (const p of projects) {
      const resolvedName = p.name || p.displayName || '';
      if (resolvedName) {
        projectMap.set(p._id.toString(), resolvedName);
      }
    }
    console.log(`  Loaded ${projectMap.size} projects with resolved names (out of ${projects.length} total).`);

    // ── 2. Find chunks with missing / empty projectName ───────────────────────
    console.log('Finding DocumentChunk records with missing projectName...');
    const chunks = await epic.find(
      { _schemaName: 'DocumentChunk', projectId: { $exists: true }, $or: [
        { projectName: { $exists: false } },
        { projectName: '' },
        { projectName: null },
      ]},
      { projection: { _id: 1, projectId: 1, projectName: 1 } }
    ).toArray();
    console.log(`  Found ${chunks.length} chunks needing projectName.`);

    if (chunks.length === 0) {
      console.log('Nothing to fix. Exiting.');
      return;
    }

    // ── 3. Bulk update ────────────────────────────────────────────────────────
    console.log('Building bulk update operations...');
    const ops = [];
    let skipped = 0;

    for (const chunk of chunks) {
      const projectId   = chunk.projectId?.toString();
      const projectName = projectId ? projectMap.get(projectId) : undefined;

      if (!projectName) {
        skipped++;
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: chunk._id },
          update: { $set: { projectName } },
        },
      });
    }

    console.log(`  ${ops.length} updates queued, ${skipped} skipped (project not in map).`);

    if (ops.length === 0) {
      console.log('No updates to apply. Exiting.');
      return;
    }

    // Write in batches of 500 to avoid oversized bulkWrite calls
    const BATCH = 500;
    let done = 0;
    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = ops.slice(i, i + BATCH);
      const result = await epic.bulkWrite(batch, { ordered: false });
      done += result.modifiedCount;
      process.stdout.write(`  \r  ${done}/${ops.length} updated...`);
    }

    console.log(`\n\nDone. ${done} DocumentChunk records updated with projectName.`);
    console.log('Next step: run typesense-reindex (or partial document_chunks sync) to propagate changes.');

  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
