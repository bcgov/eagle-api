#!/usr/bin/env node

'use strict';

/**
 * One-off backfill: lowercase `action` on existing audit rows.
 *
 * recordAction lowercases on write now, but rows written before that hold both 'Put' and 'put' for
 * the same verb, which splits every report bucket that groups on action.
 *
 * Safe to re-run. Why it is a script and not a migration: migrations/README.md, 'One-off scripts
 * outside this directory'.
 */

const { MongoClient } = require('mongodb');

const { infoConsoleLogger } = require('../api/helpers/logFormat');
const { buildMongoUri } = require('../config/mongo_uri');

// Not app_helper's 'default' logger: requiring it connects mongoose and loads every model, and it
// follows LOG_LEVEL, which prod sets to error.
const scriptLog = infoConsoleLogger('normalise-audit-action');

const USAGE = `Lowercase the action field on eagle-api audit rows.

Usage: node scripts/normalise-audit-action.js [--dry-run]

  --dry-run   Report which action values would change, and how many rows, without writing.
  --help      This text.

Connection comes from the same env vars run_migration.js uses: MONGODB_SERVICE_HOST, MONGODB_PORT,
MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_AUTHSOURCE.`;

const LOWERCASE_ACTION = [{ $set: { action: { $toLower: '$action' } } }];

const mixedCaseFilter = (mixedCase) => ({ action: { $in: mixedCase } });

async function backfill(audit, dryRun) {
  // distinct() rides the {action:1, objId:1} index, so the mixed-case values are found without
  // scanning every row, and the update below can then filter on an exact-value $in.
  const values = await audit.distinct('action');
  const mixedCase = values.filter(value => typeof value === 'string' && value !== value.toLowerCase());

  if (mixedCase.length === 0) {
    scriptLog.info('No mixed-case action values left; nothing to do');
    return;
  }

  scriptLog.info(`Mixed-case action values: ${mixedCase.join(', ')}`);

  if (dryRun) {
    const matched = await audit.countDocuments(mixedCaseFilter(mixedCase));
    scriptLog.info(`[dry-run] matched ${matched} rows, modified 0`);
    return;
  }

  const result = await audit.updateMany(mixedCaseFilter(mixedCase), LOWERCASE_ACTION);
  scriptLog.info(`matched ${result.matchedCount} rows, modified ${result.modifiedCount}`);
}

async function run(dryRun) {
  const client = new MongoClient(buildMongoUri());
  await client.connect();

  try {
    await backfill(client.db(process.env.MONGODB_DATABASE || 'epic').collection('audit'), dryRun);
  } finally {
    await client.close();
  }
}

function parseArgs(argv) {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    dryRun: argv.includes('--dry-run'),
    unknown: argv.filter(arg => arg !== '--dry-run')
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  if (args.unknown.length > 0) {
    process.stderr.write(`Unknown argument: ${args.unknown.join(' ')}\n\n${USAGE}\n`);
    process.exit(2);
  }

  run(args.dryRun).catch(err => {
    scriptLog.error(`Backfill failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

module.exports = { backfill, parseArgs };
