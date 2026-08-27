'use strict';

/**
 * Make the who-published report refresh finish.
 *
 * 1. Index audit on {action, objId}. The report prefilters on both; without
 *    the index it scanned every audit row and timed out nightly. Prod already
 *    has this index by hand (default name), so createIndex is a no-op there.
 * 2. Project unpublish wrote action:'Put', meta:'Unpublish' (args swapped),
 *    so the report never listed them. Retag those rows.
 */

exports.up = async function (db) {
  const audit = db.collection('audit');
  await audit.createIndex({ action: 1, objId: 1 }, { background: true });
  const r = await audit.updateMany(
    { action: 'Put', meta: 'Unpublish' },
    { $set: { action: 'Unpublish', meta: 'Project' } }
  );
  console.log(`Retagged ${r.modifiedCount} project unpublish audit rows`);
};

// Retag cannot be undone without corrupting rows the fixed code writes, and
// prod built the index by hand before this migration. Keep both.
exports.down = async function () {};
