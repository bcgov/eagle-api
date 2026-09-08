#!/usr/bin/env node

'use strict';

/**
 * One-off re-push: send existing Mongo records to DEMI through the same helper the controllers use.
 *
 * DEMI rows seeded before eagle-api started mirroring lack the push-only enrichment — a project's
 * applicableRegulation, resolved pins, featuredDocuments and per-legislation proponent labels are
 * added in api/helpers/demiPush.js on the way out, not stored in Mongo. Nothing re-pushes a record
 * that has not been edited since, so this walks a collection and pushes every record once.
 *
 * Resumable: the state file holds the last `_id` a settled batch reached, so a rerun with the same
 * --state picks up after it. Safe to re-run; the DEMI write is a PUT on the record id.
 *
 * Why it is a script and not a migration: migrations/README.md, 'One-off scripts outside this
 * directory'.
 */

const fs = require('fs');
const mongoose = require('mongoose');

// Requiring app_helper registers the 'default' logger and every mongoose model, which demiPush
// needs to resolve List and Organization. Its connect is not used: it builds a URI with no port, so
// MONGODB_PORT would be ignored.
const appHelper = require('../app_helper');
const demiPush = require('../api/helpers/demiPush');
const pushClient = require('../api/helpers/pushClient');
const { buildMongoUri } = require('../config/mongo_uri');
const { mongooseOptions } = require('../config/mongoose_options');

const defaultLog = appHelper.defaultLog;

// Same gate demiPush is built on (api/helpers/demiPush.js), so the script is off exactly when the
// helper's pushes are off.
const demiClient = pushClient({
  name: 'demi-repush',
  baseEnv: 'DEMI_API_BASE',
  keyEnv: 'DEMI_APIM_KEY',
  keyHeader: 'Ocp-Apim-Subscription-Key',
  method: 'PUT'
});

const DEFAULT_CONCURRENCY = 4;
const PROGRESS_EVERY = 100;

// Every model below shares the `epic` collection, so _schemaName is what separates them.
// sinceFields are the timestamp candidates for --since; only the ones the schema declares as a
// Date are used, because the matching dateAdded fields are Strings and would compare as text.
// A project keeps its dates inside the legislation blocks, not at the top level, and a
// projectNotification has no update stamp at all, so --since is refused for that kind.
const KINDS = {
  project: {
    model: 'Project',
    schemaName: 'Project',
    push: 'project',
    sinceFields: ['legislation_1996.dateUpdated', 'legislation_2002.dateUpdated', 'legislation_2018.dateUpdated']
  },
  document: { model: 'Document', schemaName: 'Document', push: 'document', sinceFields: ['_updatedDate', 'dateUploaded'] },
  commentPeriod: { model: 'CommentPeriod', schemaName: 'CommentPeriod', push: 'commentPeriod', sinceFields: ['dateUpdated', 'dateAdded'] },
  comment: { model: 'Comment', schemaName: 'Comment', push: 'comment', sinceFields: ['dateUpdated', 'dateAdded'] },
  organization: { model: 'Organization', schemaName: 'Organization', push: 'organization', sinceFields: ['dateUpdated', 'dateAdded'] },
  projectNotification: { model: 'ProjectNotification', schemaName: 'ProjectNotification', push: 'projectNotification', sinceFields: [] }
};

const USAGE = `Re-push existing eagle-api records to DEMI through api/helpers/demiPush.js.

Usage: node scripts/demi-repush.js [options]

  --kind <name>    ${Object.keys(KINDS).join(' | ')} (default: project)
  --since <ISO>    Only records whose timestamp is at or after this date, e.g. 2026-01-01
  --limit <N>      Stop after N records.
  --state <path>   Checkpoint file. Written after each settled batch; a rerun resumes after the
                   last _id it holds. Default: no checkpoint, the whole collection every run.
  --concurrency N  Pushes in flight (default: ${DEFAULT_CONCURRENCY}).
  --dry-run        Count what would be pushed and push nothing. This is the default.
  --live           Actually push.
  --help           This text.

Connection comes from the same env vars run_migration.js uses: MONGODB_SERVICE_HOST, MONGODB_PORT,
MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_AUTHSOURCE. Pushes need DEMI_API_BASE
and DEMI_APIM_KEY; without them the run exits 2 rather than reporting a silent success.

Exit codes: 0 everything pushed, 1 the run itself failed, 2 bad arguments or DEMI not configured,
3 the run finished with records DEMI did not accept.`;

// Only a Date path can be compared to a Date; a String path would match on text order.
function dateFields(model, names) {
  return names.filter(name => {
    const path = model.schema && model.schema.path(name);
    return !!path && path.instance === 'Date';
  });
}

const noSinceField = kind => `${kind.model} has no date field --since can filter on; drop --since for this kind`;

function buildQuery(kind, options) {
  const query = { _schemaName: kind.schemaName };

  if (options.lastId) {
    query._id = { $gt: new mongoose.Types.ObjectId(String(options.lastId)) };
  }

  if (options.since) {
    const fields = dateFields(options.model, kind.sinceFields);
    if (fields.length === 0) {
      throw new Error(noSinceField(kind));
    }
    query.$or = fields.map(field => ({ [field]: { $gte: options.since } }));
  }

  return query;
}

function readState(statePath) {
  if (!statePath || !fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// Rename is atomic on the same filesystem, so a kill mid-write cannot leave a half-written
// checkpoint behind.
function writeState(statePath, state) {
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, statePath);
}

/**
 * Walk `cursor` in _id order and hand each record to `push`, up to `concurrency` at a time.
 *
 * A push counts as failed when it rejects or resolves false, which is what demiPush returns for a
 * PUT DEMI did not accept. Failures are logged and their ids returned; the run carries on.
 *
 * The checkpoint fires once a whole batch has settled and only ever names a record with nothing
 * failed or unfinished behind it. After the first failure it stops advancing, so a rerun starts
 * before the hole rather than past it — at the cost of re-pushing the records after it, which is
 * harmless because the DEMI write is a PUT on the record id.
 */
async function repush(options) {
  const cursor = options.cursor;
  const push = options.push;
  const log = options.log || defaultLog;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const limit = typeof options.limit === 'number' ? options.limit : null;
  const dryRun = options.dryRun !== false;
  const onCheckpoint = options.onCheckpoint;
  const progressEvery = options.progressEvery || PROGRESS_EVERY;

  const counts = { seen: 0, pushed: 0, failed: 0, failedIds: [] };
  let reported = 0;
  let checkpointId = options.startId || null;
  let frozen = false;

  try {
    for (;;) {
      const batch = [];
      while (batch.length < concurrency && (limit === null || counts.seen + batch.length < limit)) {
        const doc = await cursor.next();
        if (!doc) {
          break;
        }
        batch.push(doc);
      }

      if (batch.length === 0) {
        break;
      }
      counts.seen += batch.length;

      if (!dryRun) {
        const landed = await Promise.all(batch.map(async doc => {
          try {
            if (await push(doc) === false) {
              log.error(`[demi-repush] DEMI did not accept ${doc._id}`);
              return false;
            }
            return true;
          } catch (err) {
            log.error(`[demi-repush] push failed for ${doc._id}: ${err.message}`);
            return false;
          }
        }));

        // In batch order, so failedIds stay in _id order for a retry.
        landed.forEach((ok, i) => {
          if (ok) {
            counts.pushed++;
          } else {
            counts.failed++;
            counts.failedIds.push(String(batch[i]._id));
          }
        });

        if (!frozen) {
          const firstFailure = landed.indexOf(false);
          if (firstFailure === -1) {
            checkpointId = String(batch[batch.length - 1]._id);
          } else {
            frozen = true;
            if (firstFailure > 0) {
              checkpointId = String(batch[firstFailure - 1]._id);
            }
            log.warn(`[demi-repush] checkpoint held at ${checkpointId || 'the start'}: ${batch[firstFailure]._id} failed`);
          }
        }

        if (onCheckpoint) {
          await onCheckpoint(checkpointId, counts);
        }
      }

      if (counts.seen - reported >= progressEvery) {
        reported = counts.seen;
        log.info(`[demi-repush] ${counts.seen} seen, ${counts.pushed} pushed, ${counts.failed} failed`);
      }

      if (limit !== null && counts.seen >= limit) {
        break;
      }
    }
  } finally {
    if (cursor && typeof cursor.close === 'function') {
      await cursor.close();
    }
  }

  return counts;
}

function parseArgs(argv) {
  const args = {
    kind: 'project',
    since: null,
    limit: null,
    state: null,
    concurrency: DEFAULT_CONCURRENCY,
    live: false,
    help: false,
    unknown: []
  };
  const withValue = { '--kind': 'kind', '--since': 'since', '--limit': 'limit', '--state': 'state', '--concurrency': 'concurrency' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.live = false;
    } else if (arg === '--live') {
      args.live = true;
    } else if (withValue[arg]) {
      args[withValue[arg]] = argv[++i];
    } else {
      args.unknown.push(arg);
    }
  }

  if (args.limit !== null) {
    args.limit = Number(args.limit);
  }
  args.concurrency = Number(args.concurrency);
  if (args.since) {
    args.since = new Date(args.since);
  }
  return args;
}

function validate(args) {
  if (!KINDS[args.kind]) {
    return `Unknown --kind ${args.kind}; pick one of ${Object.keys(KINDS).join(', ')}`;
  }
  if (args.unknown.length > 0) {
    return `Unknown argument: ${args.unknown.join(' ')}`;
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    return '--limit takes a positive whole number';
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    return '--concurrency takes a positive whole number';
  }
  if (args.since && Number.isNaN(args.since.getTime())) {
    return '--since takes an ISO date, e.g. 2026-01-01';
  }
  // Schema paths are registered by the app_helper require, so this needs no connection.
  const kind = KINDS[args.kind];
  if (args.since && dateFields(mongoose.model(kind.model), kind.sinceFields).length === 0) {
    return noSinceField(kind);
  }
  return null;
}

async function run(args) {
  const kind = KINDS[args.kind];

  const uri = buildMongoUri();
  // Naming the target guards against backfilling from the wrong database; the password stays out.
  defaultLog.info(`[demi-repush] connecting to ${uri.replace(/\/\/[^@]+@/, '//')}`);
  await mongoose.connect(uri, mongooseOptions);

  const model = mongoose.model(kind.model);
  const previous = readState(args.state);
  const lastId = previous && previous.kind === args.kind ? previous.lastId : null;
  if (lastId) {
    defaultLog.info(`[demi-repush] resuming ${args.kind} after _id ${lastId}`);
  }

  const query = buildQuery(kind, { model: model, since: args.since, lastId: lastId });
  const cursor = model.find(query).sort({ _id: 1 }).cursor();

  const counts = await repush({
    cursor: cursor,
    push: doc => demiPush[kind.push](doc),
    log: defaultLog,
    startId: lastId,
    concurrency: args.concurrency,
    limit: args.limit,
    dryRun: !args.live,
    onCheckpoint: args.state
      ? (id, running) => writeState(args.state, {
        kind: args.kind,
        lastId: id,
        seen: running.seen,
        pushed: running.pushed,
        failed: running.failed,
        failedIds: running.failedIds,
        updatedAt: new Date().toISOString()
      })
      : null
  });

  if (args.live) {
    defaultLog.info(`[demi-repush] done: ${counts.seen} seen, ${counts.pushed} pushed, ${counts.failed} failed`);
    if (counts.failed > 0) {
      defaultLog.error(`[demi-repush] failed ids: ${counts.failedIds.join(', ')}`);
    }
  } else {
    defaultLog.info(`[demi-repush] [dry-run] ${counts.seen} ${args.kind} records would be pushed; nothing sent`);
  }

  await mongoose.disconnect();
  return counts;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  const problem = validate(args);
  if (problem) {
    process.stderr.write(`${problem}\n\n${USAGE}\n`);
    process.exit(2);
  }

  if (!demiClient.configured()) {
    process.stderr.write('DEMI pushes are off: set DEMI_API_BASE and DEMI_APIM_KEY, or run this where they are set.\n');
    process.exit(2);
  }

  run(args).then(counts => {
    // exitCode rather than exit(), so the summary lines flush first.
    if (counts.failed > 0) {
      process.exitCode = 3;
    }
  }).catch(err => {
    defaultLog.error(`[demi-repush] run failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

module.exports = { KINDS, USAGE, buildQuery, dateFields, parseArgs, readState, repush, validate, writeState };
