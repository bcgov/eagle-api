#!/usr/bin/env node

'use strict';

/**
 * One-off backfill: lowercase `action` on existing audit rows.
 *
 * recordAction lowercases on write now, but rows written before that hold both 'Put' and 'put' for
 * the same verb, which splits every report bucket that groups on action.
 *
 * Deliberately not a migrations/ entry: audit is ~22M rows in prod and `yarn migrate` runs in the
 * Helm pre-upgrade hook, where a long update would stall the deploy. Safe to re-run — a second pass
 * finds nothing left to change.
 */

const winston = require('winston');
const { MongoClient } = require('mongodb');

const { buildMongoUri } = require('../config/mongo_uri');

// The app registers the 'default' logger in app_helper.js, which also connects mongoose and loads
// every model. A standalone script wants neither, so it registers its own console-only transport.
winston.loggers.add('default', {
  transports: [new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
    )
  })]
});
const defaultLog = winston.loggers.get('default');

const USAGE = `Lowercase the action field on eagle-api audit rows.

Usage: node scripts/normalise-audit-action.js [--dry-run]

  --dry-run   Report which action values would change, and how many rows, without writing.
  --help      This text.

Connection comes from the same env vars run_migration.js uses: MONGODB_SERVICE_HOST, MONGODB_PORT,
MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_AUTHSOURCE.`;

async function run(dryRun) {
  const client = new MongoClient(buildMongoUri());
  await client.connect();

  try {
    const audit = client.db(process.env.MONGODB_DATABASE || 'epic').collection('audit');

    // distinct() rides the {action:1, objId:1} index, so the mixed-case values are found without
    // scanning every row, and the update below can then filter on an exact-value $in.
    const values = await audit.distinct('action');
    const mixedCase = values.filter(value => typeof value === 'string' && value !== value.toLowerCase());

    if (mixedCase.length === 0) {
      defaultLog.info('No mixed-case action values left; nothing to do');
      return;
    }

    defaultLog.info(`Mixed-case action values: ${mixedCase.join(', ')}`);

    if (dryRun) {
      const matched = await audit.countDocuments({ action: { $in: mixedCase } });
      defaultLog.info(`[dry-run] matched ${matched} rows, modified 0`);
      return;
    }

    const result = await audit.updateMany(
      { action: { $in: mixedCase } },
      [{ $set: { action: { $toLower: '$action' } } }]
    );
    defaultLog.info(`matched ${result.matchedCount} rows, modified ${result.modifiedCount}`);
  } finally {
    await client.close();
  }
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const unknown = args.filter(arg => arg !== '--dry-run');
if (unknown.length > 0) {
  process.stderr.write(`Unknown argument: ${unknown.join(' ')}\n\n${USAGE}\n`);
  process.exit(2);
}

run(args.includes('--dry-run')).catch(err => {
  defaultLog.error(`Backfill failed: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
