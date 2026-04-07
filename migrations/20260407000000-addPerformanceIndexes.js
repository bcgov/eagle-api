'use strict';

var dbm;
var type;
var seed;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

/**
 * Add compound indexes to the epic collection for commonly queried patterns
 * that previously caused full collection scans.
 *
 * 1. RecentActivity listing  — queries {_schemaName, active, pinned} sorted by dateAdded
 * 2. Document-by-project     — queries {_schemaName, project} in document listings
 */
exports.up = async function (db) {
  let mClient;
  try {
    mClient = await db.connection.connect(db.connectionString, { native_parser: true });
    const epic = mClient.collection('epic');

    await epic.createIndex(
      { _schemaName: 1, active: 1, pinned: 1, dateAdded: -1 },
      { name: 'idx_recentActivity_active_pinned_date', background: true }
    );
    console.log('Created index: idx_recentActivity_active_pinned_date');

    await epic.createIndex(
      { _schemaName: 1, project: 1 },
      { name: 'idx_document_by_project', background: true }
    );
    console.log('Created index: idx_document_by_project');
  } finally {
    if (mClient) mClient.close();
  }
};

exports.down = async function (db) {
  let mClient;
  try {
    mClient = await db.connection.connect(db.connectionString, { native_parser: true });
    const epic = mClient.collection('epic');
    await epic.dropIndex('idx_recentActivity_active_pinned_date');
    await epic.dropIndex('idx_document_by_project');
  } finally {
    if (mClient) mClient.close();
  }
};

exports._meta = {
  version: 1
};
