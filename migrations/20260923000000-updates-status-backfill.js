'use strict';

// Update (RecentActivity) status and publish workflow.
//
// Backfills status, publishDate and notifiedAt on rows written before those fields existed:
// published when the row was live (active and public in read[]), draft otherwise; publishDate and
// notifiedAt from dateAdded, so no existing Update is ever emailed again. Only rows with no status
// are touched: a rerun must never mark an Update written since as already emailed.
//
// Seeds the updateCategory List entries. updateSubject starts empty: List.type is a free string,
// so there is nothing to register for it.

const winston = require('winston');

const log = winston.loggers.get('default');

const BATCH_SIZE = 500;

const CATEGORY_NAMES = ['Project News', 'PN News', 'Engagement', 'Compliance', 'Corporate'];

const categoryItems = CATEGORY_NAMES.map((name, index) => ({
  _schemaName: 'List',
  type: 'updateCategory',
  name,
  // The List model default: categories apply under every legislation.
  legislation: 0,
  listOrder: index,
  read: ['public', 'staff', 'sysadmin'],
  write: ['staff', 'sysadmin']
}));

const isSet = value => value !== undefined && value !== null;

/**
 * The $set for one row written before status existed.
 */
function backfillFields(row) {
  const live = row.active === true && Array.isArray(row.read) && row.read.includes('public');
  // A row missing dateAdded would otherwise never pass the publishDate <= now check.
  const added = isSet(row.dateAdded) ? row.dateAdded : row._id.getTimestamp();
  const set = { status: live ? 'published' : 'draft' };
  if (!isSet(row.publishDate)) {
    set.publishDate = added;
  }
  if (!isSet(row.notifiedAt)) {
    set.notifiedAt = added;
  }
  return set;
}

async function backfill(epic) {
  const cursor = epic.find(
    { _schemaName: 'RecentActivity', status: null },
    {
      projection: { _id: 1, status: 1, active: 1, read: 1, dateAdded: 1, publishDate: 1, notifiedAt: 1 },
      collation: { locale: 'en', strength: 2 }
    }
  );

  let ops = [];
  let modified = 0;
  const flush = async () => {
    if (ops.length) {
      const result = await epic.bulkWrite(ops, { ordered: false });
      modified += result.modifiedCount;
      ops = [];
    }
  };

  for await (const row of cursor) {
    ops.push({ updateOne: { filter: { _id: row._id, status: null }, update: { $set: backfillFields(row) } } });
    if (ops.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();
  log.info(`[updates-status-backfill] RecentActivity rows backfilled: ${modified}`);
}

async function seedCategories(epic) {
  for (const item of categoryItems) {
    const existing = await epic.findOne({ _schemaName: 'List', type: item.type, name: item.name });
    if (!existing) {
      await epic.insertOne({ ...item });
      log.info(`[updates-status-backfill] Inserted ${item.type} '${item.name}'`);
    }
  }
}

module.exports = {
  async up(db) {
    // The migration runner does not configure winston the way app.js does.
    if (!log.transports.length) {
      log.add(new winston.transports.Console());
    }
    const epic = db.collection('epic');
    await backfill(epic);
    await seedCategories(epic);
  },

  // Removes the seeded categories only. The backfilled fields stay: once staff have edited an
  // Update there is no telling a backfilled value from one they set.
  async down(db) {
    await db.collection('epic').deleteMany({ _schemaName: 'List', type: 'updateCategory', name: { $in: CATEGORY_NAMES } });
  }
};
