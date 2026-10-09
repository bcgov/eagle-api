#!/usr/bin/env node

'use strict';

/**
 * One-off fix: drop repeated Organization ids from each project's `pins`, then re-push the project
 * to DEMI so its copy loses the repeats too.
 *
 * Adding pins used $push, so a nation added twice was stored twice. Eagle's pin reads collapse the
 * repeats, but the DEMI push sent one pin per entry and the public site listed each one. Adding now
 * uses $addToSet; this repairs projects written before that.
 *
 * The only write is `$set: { pins }` on a project whose pins hold a repeat. The first copy of each
 * id stays, in its place. Safe to re-run.
 *
 * Why it is a script and not a migration: migrations/README.md, 'One-off scripts outside this
 * directory'.
 */

const mongoose = require('mongoose');

// Requiring app_helper registers every mongoose model, which demiPush needs to resolve the pinned
// organizations.
require('../app_helper');
const demiPush = require('../api/helpers/demiPush');
const { LEGISLATION_KEYS } = require('../api/helpers/constants');
const { infoConsoleLogger } = require('../api/helpers/logFormat');
const { buildMongoUri } = require('../config/mongo_uri');
const { mongooseOptions } = require('../config/mongoose_options');

// Not the app's 'default' logger: it follows LOG_LEVEL, and prod runs error.
const scriptLog = infoConsoleLogger('dedupe-project-pins');

const USAGE = `Remove repeated ids from project pins and re-push each fixed project to DEMI.

Usage: node scripts/dedupe-project-pins.js [--apply [--no-demi]]

  (no flag)   Dry run: list each project with repeated pins and its before and after counts.
  --apply     Write the deduped pins and re-push each fixed project to DEMI.
  --no-demi   With --apply: write Mongo only, no DEMI re-push. For an environment with no DEMI.
  --help      This text.

Connection comes from the same env vars run_migration.js uses: MONGODB_SERVICE_HOST, MONGODB_PORT,
MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_AUTHSOURCE. --apply also needs
DEMI_API_BASE and DEMI_APIM_KEY; without them it exits 2 rather than fix Mongo and leave DEMI stale,
unless --no-demi is given.

Exit codes: 0 done, 1 the run failed, 2 bad arguments or DEMI not configured, 3 a project was not
fixed or DEMI did not accept its push.`;

const pinsOf = { $ifNull: ['$pins', []] };
const DUPLICATE_PINS = {
  _schemaName: 'Project',
  $expr: { $ne: [{ $size: pinsOf }, { $size: { $setUnion: [pinsOf, []] } }] }
};

// A project's name lives in its legislation blocks; the current one names it.
const READ_FIELDS = Object.assign({ pins: 1, currentLegislationYear: 1 }, ...LEGISLATION_KEYS.map(key => ({ [`${key}.name`]: 1 })));
const nameOf = project => (project[project.currentLegislationYear] || {}).name || '';

// A Set keeps first-insertion order, so each id stays where it was first pinned.
const dedupePins = pins => [...new Set(pins.map(String))];

async function dedupe(Project, apply, { noDemi = false } = {}) {
  const projects = await Project.find(DUPLICATE_PINS, READ_FIELDS).sort({ _id: 1 }).lean();
  const failed = [];

  if (apply && noDemi) {
    if (demiPush.configured()) {
      scriptLog.warn('[dedupe-project-pins] --no-demi: DEMI is configured but fixed projects are not re-pushed; DEMI keeps the repeated pins');
    } else {
      scriptLog.info('[dedupe-project-pins] --no-demi: fixed projects are not re-pushed to DEMI');
    }
  }

  for (const project of projects) {
    const pins = dedupePins(project.pins);
    const label = `${project._id} "${nameOf(project)}": ${project.pins.length} pins, ${pins.length} distinct`;
    if (!apply) {
      scriptLog.info(`[dedupe-project-pins] [dry-run] ${label}`);
      continue;
    }
    // Matching on the pins as read skips a project an admin changed since, instead of undoing it.
    const doc = await Project.findOneAndUpdate(
      { _id: project._id, pins: project.pins },
      { $set: { pins } },
      { returnDocument: 'after' }
    );
    if (!doc) {
      scriptLog.warn(`[dedupe-project-pins] ${project._id} changed since it was read; not fixed, rerun to pick it up`);
      failed.push(String(project._id));
      continue;
    }
    if (!noDemi && await demiPush.project(doc) === false) {
      scriptLog.error(`[dedupe-project-pins] ${label}: fixed in Mongo, DEMI did not accept the push`);
      failed.push(String(project._id));
      continue;
    }
    scriptLog.info(`[dedupe-project-pins] fixed ${label}`);
  }

  scriptLog.info(`[dedupe-project-pins] ${projects.length} project(s) with repeated pins${apply ? `, ${projects.length - failed.length} fixed` : '; nothing written'}`);
  if (failed.length > 0) {
    scriptLog.error(`[dedupe-project-pins] not fixed or not pushed: ${failed.join(', ')}`);
  }
  return { found: projects.length, failed };
}

async function run(apply, options) {
  const uri = buildMongoUri();
  scriptLog.info(`[dedupe-project-pins] connecting to ${uri.replace(/\/\/[^@]+@/, '//')}`);
  await mongoose.connect(uri, mongooseOptions);
  try {
    return await dedupe(mongoose.model('Project'), apply, options);
  } finally {
    await mongoose.disconnect();
  }
}

function parseArgs(argv) {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    apply: argv.includes('--apply'),
    noDemi: argv.includes('--no-demi'),
    unknown: argv.filter(arg => !['--apply', '--no-demi', '--help', '-h'].includes(arg))
  };
}

// Why the run must stop before it connects (exit 2), or null to go ahead.
function validate(args) {
  if (args.unknown.length > 0) {
    return `Unknown argument: ${args.unknown.join(' ')}\n\n${USAGE}`;
  }
  if (args.apply && !args.noDemi && !demiPush.configured()) {
    return 'DEMI pushes are off: set DEMI_API_BASE and DEMI_APIM_KEY, run this where they are set, or pass --no-demi.';
  }
  return null;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const problem = validate(args);
  if (problem) {
    process.stderr.write(`${problem}\n`);
    process.exit(2);
  }

  run(args.apply, { noDemi: args.noDemi }).then(result => {
    if (result.failed.length > 0) {
      process.exitCode = 3;
    }
  }).catch(err => {
    scriptLog.error(`[dedupe-project-pins] run failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

module.exports = { DUPLICATE_PINS, dedupe, dedupePins, parseArgs, validate };
