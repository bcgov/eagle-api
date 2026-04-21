'use strict';

/**
 * Popularity sync: penguin-analytics → Typesense
 *
 * Queries the penguin-analytics PostgreSQL database for click and download
 * events over the past 30 days, computes a weighted popularity score per
 * document/project, and patches the live Typesense collections with those
 * scores.  The scores are stored in the `popularity` field (int32, optional)
 * on each document — Typesense can then use them for ranking.
 *
 * Scoring weights (30-day rolling window):
 *   Search Download Clicked            → weight 3  (strongest intent signal)
 *   Search Result Clicked (document)   → weight 1
 *   Search Result Clicked (project)    → weight 1
 *
 * Why 30 days?  Time-windowing prevents old documents/projects permanently
 * outranking newer ones.  The window can be tuned via POPULARITY_WINDOW_DAYS.
 *
 * Run manually:   node typesense-sync/src/popularity-sync.js
 * Run via cron:   Kubernetes CronJob (helm/typesense/templates/popularity-cronjob.yaml)
 *                 Scheduled at 3 AM — 1 hour after the nightly full re-index.
 *
 * Environment variables (Typesense — same as full-sync.js):
 *   TYPESENSE_HOST, TYPESENSE_PORT, TYPESENSE_API_KEY
 *
 * Environment variables (penguin-analytics PostgreSQL):
 *   PENGUIN_DB_HOST       - PostgreSQL hostname  (default: penguin-analytics-database)
 *   PENGUIN_DB_PORT       - PostgreSQL port       (default: 5432)
 *   PENGUIN_DB_NAME       - Database name         (default: analytics)
 *   PENGUIN_DB_USER       - Username              (default: analytics_user)
 *   PENGUIN_DB_PASSWORD   - Password              (required in production)
 *   PENGUIN_DB_SSL        - Set to "true" to enable TLS (default: false, cluster-internal)
 *
 * Optional tuning:
 *   POPULARITY_WINDOW_DAYS   - Rolling window in days (default: 30)
 *   POPULARITY_BATCH_SIZE    - Documents per Typesense update batch (default: 100)
 */

const { Pool } = require('pg');
const { getClient } = require('./typesenseClient');

const WINDOW_DAYS = parseInt(process.env.POPULARITY_WINDOW_DAYS || '30', 10);
const BATCH_SIZE  = parseInt(process.env.POPULARITY_BATCH_SIZE  || '100', 10);

// ── PostgreSQL query ─────────────────────────────────────────────────────────

/**
 * Returns rows: { result_id, collection, popularity }
 *
 * Weighted aggregation:
 *   - downloads always count 3× regardless of result_type
 *   - clicks count 1× for both projects and documents
 *
 * We separate project and document scores because result_id is the Mongo _id
 * string in both cases — there is no collision risk (different collections),
 * but we return the collection name so callers can route correctly.
 */
const POPULARITY_QUERY = `
  SELECT
    properties->>'result_id'                                      AS result_id,
    CASE
      WHEN event_type = 'Search Result Clicked'
       THEN properties->>'result_type'   -- 'project' or 'document'
      ELSE 'document'                    -- Search Download Clicked is always a document
    END                                                           AS collection,
    SUM(
      CASE event_type
        WHEN 'Search Download Clicked'  THEN 3
        WHEN 'Search Result Clicked'    THEN 1
        ELSE 1
      END
    )::int                                                        AS popularity
  FROM events
  WHERE event_type IN ('Search Result Clicked', 'Search Download Clicked')
    AND source_app = 'eagle-public'
    AND timestamp  > NOW() - ($1 || ' days')::INTERVAL
    AND properties->>'result_id' IS NOT NULL
  GROUP BY result_id, collection
`;

// ── Typesense batch-update ────────────────────────────────────────────────────

/**
 * Patch the popularity field on a set of documents in a Typesense collection.
 * Uses action:'update' so only the popularity field is changed — all other
 * fields (name, facets, etc.) remain untouched.
 */
async function patchPopularity(typesense, collectionAlias, updates) {
  if (updates.length === 0) return { patched: 0, failed: 0 };

  let patched = 0;
  let failed  = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await typesense
      .collections(collectionAlias)
      .documents()
      .import(batch, { action: 'update', dirty_values: 'coerce_or_drop' });

    for (const r of results) {
      if (r.success) patched++;
      else {
        failed++;
        if (failed <= 5) {
          console.warn(`  Update failed for document ${r.document?.id}: ${r.error}`);
        }
      }
    }
  }

  return { patched, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting popularity sync:', new Date().toISOString());
  console.log(`  Window: ${WINDOW_DAYS} days`);

  // ── Connect to penguin-analytics PostgreSQL ────────────────────────────────
  const pg = new Pool({
    host:     process.env.PENGUIN_DB_HOST     || 'penguin-analytics-database',
    port:     parseInt(process.env.PENGUIN_DB_PORT || '5432', 10),
    database: process.env.PENGUIN_DB_NAME     || 'analytics',
    user:     process.env.PENGUIN_DB_USER     || 'analytics_user',
    password: process.env.PENGUIN_DB_PASSWORD || '',
    ssl:      process.env.PENGUIN_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis:       10000,
    max:                     2,
  });

  // ── Connect to Typesense ───────────────────────────────────────────────────
  const typesense = getClient();

  try {
    // ── Query click scores from penguin ───────────────────────────────────────
    console.log('Querying penguin-analytics for click scores...');
    const { rows } = await pg.query(POPULARITY_QUERY, [WINDOW_DAYS]);
    console.log(`  Found ${rows.length} scored documents/projects`);

    if (rows.length === 0) {
      console.log('No popularity data found — skipping Typesense update.');
      console.log('  (This is expected if search analytics collection has just started.)');
      return;
    }

    // ── Split by collection ───────────────────────────────────────────────────
    const byCollection = { projects: [], documents: [] };
    for (const row of rows) {
      const col = row.collection === 'project' ? 'projects' : 'documents';
      byCollection[col].push({ id: row.result_id, popularity: parseInt(row.popularity, 10) });
    }

    console.log(`  Projects to update: ${byCollection.projects.length}`);
    console.log(`  Documents to update: ${byCollection.documents.length}`);

    // ── Patch Typesense collections ────────────────────────────────────────────
    for (const [alias, updates] of Object.entries(byCollection)) {
      if (updates.length === 0) continue;
      process.stdout.write(`Patching "${alias}"...`);
      const { patched, failed } = await patchPopularity(typesense, alias, updates);
      console.log(` ${patched} patched, ${failed} failed`);
    }

    console.log('Popularity sync complete:', new Date().toISOString());
  } catch (err) {
    // Non-zero exit so Kubernetes marks the job as failed and retries
    console.error('Popularity sync failed:', err.message);
    process.exit(1);
  } finally {
    await pg.end();
  }
}

main();
