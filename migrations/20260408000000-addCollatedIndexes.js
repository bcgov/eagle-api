'use strict';

/**
 * Fix performance indexes to use the same collation as the application.
 *
 * All search queries in the app use .collation({ locale: 'en', strength: 2 }).
 * MongoDB cannot use an index for string field comparisons when the query
 * collation differs from the index collation. The previous migration created
 * indexes with the default binary collation, so they were never used in
 * production — every query scanned all 79,000+ documents.
 *
 * This migration:
 *  1. Drops the two binary-collation indexes from the previous migration.
 *  2. Recreates them with collation {locale:'en', strength:2}.
 *  3. Adds idx_schemaName_en on {_schemaName:1} — covers all schema-filtered
 *     queries (Project list, Document list, RecentActivity search, etc.).
 *  4. Adds idx_comment_by_period on {_schemaName:1, period:1} — covers
 *     GET /comment?period=X (11k comments, called on every comment page).
 *
 * Query pattern coverage (all use collation {locale:'en', strength:2}):
 *
 *   Pattern                                    Index used
 *   ──────────────────────────────────────────  ──────────────────────────────
 *   {_schemaName:'Project'}                    idx_schemaName_en
 *   {_schemaName:'Document', project:ObjectId} idx_document_by_project
 *   {_schemaName:'Document'}                   idx_schemaName_en
 *   {_schemaName:'Comment', period:ObjectId}   idx_comment_by_period
 *   {_schemaName:'CommentPeriod', project:OId} idx_document_by_project (reused)
 *   {_schemaName:'RecentActivity', active, …}  idx_recentActivity_active_pinned_date
 *   {_schemaName:'Organization'}               idx_schemaName_en
 */

const COLLATION = { locale: 'en', strength: 2 };

exports.up = async function (db) {
  const col = db.collection('epic');

  // Drop old binary-collation versions (ignore errors if they don't exist)
  await col.dropIndex('idx_recentActivity_active_pinned_date').catch(() => {});
  await col.dropIndex('idx_document_by_project').catch(() => {});

  // Recreate with matching collation
  await col.createIndex(
    { _schemaName: 1, active: 1, pinned: -1, dateAdded: -1 },
    { name: 'idx_recentActivity_active_pinned_date', collation: COLLATION }
  );
  await col.createIndex(
    { _schemaName: 1, project: 1 },
    { name: 'idx_document_by_project', collation: COLLATION }
  );

  // Covers every schema-only $match (Project, Organization, etc.)
  await col.createIndex(
    { _schemaName: 1 },
    { name: 'idx_schemaName_en', collation: COLLATION }
  );

  // Comments filtered by period — 11k docs, called on every comment page
  await col.createIndex(
    { _schemaName: 1, period: 1 },
    { name: 'idx_comment_by_period', collation: COLLATION }
  );
};

exports.down = async function (db) {
  const col = db.collection('epic');

  await col.dropIndex('idx_recentActivity_active_pinned_date').catch(() => {});
  await col.dropIndex('idx_document_by_project').catch(() => {});
  await col.dropIndex('idx_schemaName_en').catch(() => {});
  await col.dropIndex('idx_comment_by_period').catch(() => {});

  // Restore binary-collation versions
  await col.createIndex(
    { _schemaName: 1, active: 1, pinned: -1, dateAdded: -1 },
    { name: 'idx_recentActivity_active_pinned_date' }
  );
  await col.createIndex(
    { _schemaName: 1, project: 1 },
    { name: 'idx_document_by_project' }
  );
};
