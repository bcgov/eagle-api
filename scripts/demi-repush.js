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
 * Resumable: after each settled batch the --state file is rewritten as
 *
 *   { kind, ids: { count, sha256 } | null, since: ISO | null, lastId, seen, pushed, failed,
 *     failedIds, updatedAt }
 *
 * lastId is the last `_id` of the batch, whether its records landed or failed, so a rerun with the
 * same --state starts after it and pushes nothing twice. failedIds holds every record DEMI refused,
 * in this run and in the runs it resumed; a resume skips them. Retry them with an --ids-file and
 * another --state path, since a run over a different id list starts its state file over. seen,
 * pushed and failed count this run only. Earlier versions wrote the same shape but held lastId
 * before the first failure; resuming such a file now skips its failedIds and carries them on.
 *
 * The kind is read through a cursor in batches of CURSOR_BATCH_SIZE. If the server drops the cursor
 * anyway (CursorNotFound), it is reopened after the last `_id` read, up to MAX_CURSOR_REOPENS times
 * in a row without a record read in between.
 *
 * A re-push no longer undoes a DEMI takedown: since eagle-demi #545 a narrowed or taken-down
 * project or document keeps its DEMI access level through an Eagle push.
 *
 * Why it is a script and not a migration: migrations/README.md, 'One-off scripts outside this
 * directory'.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Requiring app_helper registers every mongoose model, which demiPush needs to resolve List and
// Organization. Its connect is not used: it builds a URI with no port, so MONGODB_PORT would be
// ignored.
require('../app_helper');
const demiPush = require('../api/helpers/demiPush');
const pushClient = require('../api/helpers/pushClient');
const { LEGISLATION_KEYS } = require('../api/helpers/constants');
const { infoConsoleLogger } = require('../api/helpers/logFormat');
const { buildMongoUri } = require('../config/mongo_uri');
const { mongooseOptions } = require('../config/mongoose_options');

// Not the app's 'default' logger: it follows LOG_LEVEL, and prod runs error.
const scriptLog = infoConsoleLogger('demi-repush');

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
// The APIM machine product allows 300 calls per 60 s per subscription, shared with the live pods.
const DEFAULT_RATE = 150;
const PROGRESS_EVERY = 100;
// Small batches, so the server cursor is touched every few pushes. Mongo's default first batch is
// up to 16 MB, which at a paced rate outlasts the server's 10-minute idle cursor timeout.
const CURSOR_BATCH_SIZE = 100;
const MAX_CURSOR_REOPENS = 3;

// Every model below shares the `epic` collection, so _schemaName is what separates them.
// sinceFields are the timestamp candidates for --since; only the ones the schema declares as a
// Date are used, because the matching dateAdded fields are Strings and would compare as text.
// A project keeps its dates inside the legislation blocks, not at the top level, and a
// projectNotification, user or group has no update stamp at all, so --since is refused for those.
const KINDS = {
  project: {
    model: 'Project',
    schemaName: 'Project',
    push: 'project',
    sinceFields: LEGISLATION_KEYS.map(key => key + '.dateUpdated')
  },
  document: { model: 'Document', schemaName: 'Document', push: 'document', sinceFields: ['_updatedDate', 'dateUploaded'] },
  commentPeriod: { model: 'CommentPeriod', schemaName: 'CommentPeriod', push: 'commentPeriod', sinceFields: ['dateUpdated', 'dateAdded'] },
  comment: { model: 'Comment', schemaName: 'Comment', push: 'comment', sinceFields: ['dateUpdated', 'dateAdded'] },
  organization: { model: 'Organization', schemaName: 'Organization', push: 'organization', sinceFields: ['dateUpdated', 'dateAdded'] },
  projectNotification: { model: 'ProjectNotification', schemaName: 'ProjectNotification', push: 'projectNotification', sinceFields: [] },
  recentActivity: { model: 'RecentActivity', schemaName: 'RecentActivity', push: 'recentActivity', sinceFields: ['dateUpdated', 'dateAdded'] },
  // optIn is the DEMI route segment DEMI_PUSH_OPT_IN_KINDS has to name before demiPush sends the kind.
  user: { model: 'User', schemaName: 'User', push: 'user', sinceFields: [], optIn: 'users' },
  group: { model: 'Group', schemaName: 'Group', push: 'group', sinceFields: [], optIn: 'groups' },
  inspection: { model: 'Inspection', schemaName: 'Inspection', push: 'inspection', sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspections' },
  inspectionElement: {
    model: 'InspectionElement', schemaName: 'InspectionElement', push: 'inspectionElement',
    sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspection-elements'
  },
  inspectionItem: {
    model: 'InspectionItem', schemaName: 'InspectionItem', push: 'inspectionItem',
    sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspection-items'
  }
};

const USAGE = `Re-push existing eagle-api records to DEMI through api/helpers/demiPush.js.

Usage: node scripts/demi-repush.js [options]

  --kind <name>    ${Object.keys(KINDS).join(' | ')}. This or --kinds is required.
  --kinds <a,b>    Several kinds, run one after another in the order given. Not with --kind.
                   A project run needs --concurrency 1, and --ids-file when live.
  --ids-file <path>
                   Only these records: 24-character Mongo ids separated by newlines, spaces or
                   commas. Ids of another kind are skipped, so one file can serve every kind.
  --since <ISO>    Only records whose timestamp is at or after this date, e.g. 2026-01-01
  --limit <N>      Stop after N records of each kind.
  --state <path>   Checkpoint file. Written after each settled batch with the last _id read and
                   the ids DEMI refused (failedIds). A rerun over the same ids and --since resumes
                   after that _id and skips the failedIds; retry those with --ids-file and
                   another --state path. With several kinds each gets its own file, the kind
                   added before the extension: /tmp/r.json becomes /tmp/r.project.json. Default: no checkpoint.
  --concurrency N  Pushes in flight (default: ${DEFAULT_CONCURRENCY}).
  --rate N         HTTP calls per minute, retries included, 1 or more (default: ${DEFAULT_RATE}).
                   The APIM subscription allows 300 a minute and the live pods share it.
  --continue-on-failure
                   With several kinds, go on to the next kind after one had failures. By
                   default the run stops there.
  --dry-run        Count what would be pushed and push nothing. This is the default.
  --live           Actually push.
  --help           This text.

A flag given with a missing or empty value, or followed straight by another flag, exits 2.

Connection comes from the same env vars run_migration.js uses: MONGODB_SERVICE_HOST, MONGODB_PORT,
MONGODB_DATABASE, MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_AUTHSOURCE. Pushes need DEMI_API_BASE
and DEMI_APIM_KEY; without them the run exits 2 rather than reporting a silent success. The user, group
and inspection kinds also need their DEMI route segment in DEMI_PUSH_OPT_IN_KINDS, else exit 2.

A failed record does not stop the kind: it is logged, listed at the end and in failedIds.
If the server drops the read cursor, the run reopens it after the last _id read, up to
${MAX_CURSOR_REOPENS} times in a row.

DEMI keeps its takedowns through a re-push (eagle-demi #545), so a re-push does not republish a
project or document DEMI has narrowed or taken down.

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

  if (options.ids) {
    query._id = Object.assign(query._id || {}, { $in: options.ids.map(id => new mongoose.Types.ObjectId(id)) });
  }

  if (options.skipIds && options.skipIds.length > 0) {
    query._id = Object.assign(query._id || {}, { $nin: options.skipIds.map(id => new mongoose.Types.ObjectId(String(id))) });
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

// A single kind keeps the --state path as given, so an existing checkpoint still resumes.
function statePathFor(statePath, kind, kindCount) {
  if (!statePath || kindCount < 2) {
    return statePath;
  }
  const parsed = path.parse(statePath);
  return path.join(parsed.dir, `${parsed.name}.${kind}${parsed.ext}`);
}

// Throws on anything that is not a 24-character hex id, so a stray log fragment cannot widen or
// silently empty the query.
function readIds(idsPath) {
  const ids = fs.readFileSync(idsPath, 'utf8').split(/[\s,]+/).filter(Boolean);
  const bad = ids.find(id => !mongoose.isObjectIdOrHexString(id));
  if (bad !== undefined) {
    throw new Error(`--ids-file ${idsPath}: "${bad}" is not a 24-character Mongo id`);
  }
  if (ids.length === 0) {
    throw new Error(`--ids-file ${idsPath} holds no ids`);
  }
  return Array.from(new Set(ids.map(id => id.toLowerCase())));
}

// Consecutive calls go out at least `gap` apart, measured from when each caller actually proceeds,
// so a late start cannot bunch the next ones up. The 1% margin keeps a closed 60 s window, both
// ends included, to perMinute calls. Slots are reserved synchronously so callers queue in order.
function rateMeter(perMinute) {
  const gap = (60000 / perMinute) * 1.01;
  let next = 0;
  let lastSent = -Infinity;
  let pausedUntil = 0;
  return {
    async acquire() {
      let ready = Math.max(Date.now(), next);
      next = ready + gap;
      for (;;) {
        const now = Date.now();
        ready = Math.max(ready, pausedUntil, lastSent + gap);
        if (now >= ready) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, ready - now));
      }
      lastSent = Date.now();
      next = Math.max(next, lastSent + gap);
    },
    // A 429 means the shared quota is spent, so every caller waits, not only the throttled one.
    pause(ms) {
      pausedUntil = Math.max(pausedUntil, Date.now() + ms);
      next = Math.max(next, pausedUntil);
    }
  };
}

function idsDigest(ids) {
  if (!ids) {
    return null;
  }
  const sha256 = crypto.createHash('sha256').update(ids.slice().sort().join('\n')).digest('hex');
  return { count: ids.length, sha256: sha256 };
}

// Where a kind's checkpoint lives, the _id to resume after and the failed ids to skip. A checkpoint
// from a run over a different id list or --since is not resumed: it would skip records this run was
// asked for.
function planKind(args, name, read) {
  const statePath = statePathFor(args.state, name, args.kinds.length);
  const ids = idsDigest(args.ids);
  const since = args.since ? args.since.toISOString() : null;
  const previous = (read || readState)(statePath);
  const was = (previous && previous.ids) || null;
  const sameIds = was === null || ids === null ? was === ids : was.count === ids.count && was.sha256 === ids.sha256;
  const sameSince = ((previous && previous.since) || null) === since;
  const resume = !!previous && previous.kind === name && sameIds && sameSince;
  const lastId = resume ? previous.lastId || null : null;
  const failedIds = resume && Array.isArray(previous.failedIds) ? previous.failedIds.map(String) : [];
  return { statePath, ids, since, lastId, failedIds };
}

// The query and checkpoint for one kind, kept apart from the connection so they can be checked.
// queryAfter(id) is the same query resumed after `id`, for reopening a lost cursor.
function kindJob(args, name, plan, model) {
  const carried = plan.failedIds || [];
  const queryAfter = lastId => buildQuery(KINDS[name], {
    model: model, since: args.since, lastId: lastId || plan.lastId, ids: args.ids, skipIds: carried
  });
  const query = queryAfter(null);
  const checkpoint = (lastId, running) => ({
    kind: name,
    ids: plan.ids,
    since: plan.since,
    lastId: lastId,
    seen: running.seen,
    pushed: running.pushed,
    failed: running.failed,
    failedIds: carried.concat(running.failedIds),
    updatedAt: new Date().toISOString()
  });
  return { query, queryAfter, checkpoint };
}

// The kind's records in _id order, fetched CURSOR_BATCH_SIZE at a time.
function kindQuery(model, query) {
  return model.find(query).sort({ _id: 1 }).batchSize(CURSOR_BATCH_SIZE);
}

// What the driver throws from next() once the server has dropped an idle cursor.
function isCursorNotFound(err) {
  return !!err && (err.code === 43 || err.codeName === 'CursorNotFound' || /cursor id .* not found/i.test(err.message || ''));
}

// Only a live run sends anything, so only a live run is paced.
function pacerFor(args) {
  return args.live ? rateMeter(args.rate) : null;
}

/**
 * Walk `cursor` in _id order and hand each record to `push`, up to `concurrency` at a time.
 *
 * A push counts as failed when it rejects or resolves false, which is what demiPush returns for a
 * PUT DEMI did not accept. Failures are logged and their ids returned; the run carries on.
 *
 * The checkpoint fires once a whole batch has settled and names its last record, failed or not, so
 * a rerun never pushes a record twice. Failed ids go to the checkpoint's failedIds instead.
 *
 * `reopen(lastId)`, when given, returns a fresh cursor for the records after lastId (null: the
 * original start). It replaces a cursor the server dropped, at most MAX_CURSOR_REOPENS times in a
 * row without a record read in between; any other cursor error ends the run.
 */
async function repush(options) {
  let cursor = options.cursor;
  const reopen = options.reopen;
  const push = options.push;
  const log = options.log || scriptLog;
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  const limit = typeof options.limit === 'number' ? options.limit : null;
  const dryRun = options.dryRun !== false;
  const onCheckpoint = options.onCheckpoint;
  const progressEvery = options.progressEvery || PROGRESS_EVERY;

  const counts = { seen: 0, pushed: 0, failed: 0, failedIds: [] };
  let reported = 0;
  let lastRead = null;
  let reopens = 0;

  const next = async () => {
    for (;;) {
      try {
        const doc = await cursor.next();
        reopens = 0;
        if (doc) {
          lastRead = String(doc._id);
        }
        return doc;
      } catch (err) {
        if (!reopen || !isCursorNotFound(err) || reopens >= MAX_CURSOR_REOPENS) {
          throw err;
        }
        reopens++;
        log.warn(`[demi-repush] cursor lost (${err.message}); reopening after ${lastRead || 'the start'}, attempt ${reopens} of ${MAX_CURSOR_REOPENS}`);
        // The server has already dropped it; closing only frees the driver side.
        await Promise.resolve().then(() => cursor.close()).catch(() => {});
        cursor = await reopen(lastRead);
      }
    }
  };

  try {
    for (;;) {
      const batch = [];
      while (batch.length < concurrency && (limit === null || counts.seen + batch.length < limit)) {
        const doc = await next();
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

        if (onCheckpoint) {
          await onCheckpoint(String(batch[batch.length - 1]._id), counts);
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
    kind: null,
    kinds: null,
    idsFile: null,
    since: null,
    limit: null,
    state: null,
    concurrency: DEFAULT_CONCURRENCY,
    rate: DEFAULT_RATE,
    live: false,
    continueOnFailure: false,
    help: false,
    unknown: [],
    noValue: []
  };
  const withValue = {
    '--kind': 'kind',
    '--kinds': 'kinds',
    '--ids-file': 'idsFile',
    '--since': 'since',
    '--limit': 'limit',
    '--state': 'state',
    '--concurrency': 'concurrency',
    '--rate': 'rate'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.live = false;
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--continue-on-failure') {
      args.continueOnFailure = true;
    } else if (withValue[arg]) {
      // An unset shell variable must fail the run, never drop a filter and widen it.
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        args.noValue.push(arg);
      } else {
        i++;
        if (value.trim() === '') {
          args.noValue.push(arg);
        } else {
          args[withValue[arg]] = value;
        }
      }
    } else {
      args.unknown.push(arg);
    }
  }

  if (args.limit !== null) {
    args.limit = Number(args.limit);
  }
  args.bothKindFlags = args.kind !== null && args.kinds !== null;
  const kinds = args.kinds !== null ? args.kinds : args.kind !== null ? args.kind : '';
  args.kinds = Array.from(new Set(kinds.split(',').map(kind => kind.trim()).filter(Boolean)));
  delete args.kind;
  args.concurrency = Number(args.concurrency);
  args.rate = Number(args.rate);
  if (args.since) {
    args.since = new Date(args.since);
  }
  return args;
}

function validate(args) {
  if (args.noValue.length > 0) {
    return `${args.noValue.join(', ')} needs a value`;
  }
  if (args.bothKindFlags) {
    return 'Give --kind or --kinds, not both';
  }
  const unknownKind = args.kinds.find(kind => !KINDS[kind]);
  if (unknownKind !== undefined) {
    return `Unknown --kind ${unknownKind}; pick one of ${Object.keys(KINDS).join(', ')}`;
  }
  if (args.kinds.length === 0) {
    return `--kind or --kinds is required: ${Object.keys(KINDS).join(', ')}`;
  }
  // Otherwise every record would count as pushed while demiPush sent nothing.
  const offKind = args.kinds.find(kind => KINDS[kind].optIn && !demiPush.optedIn(KINDS[kind].optIn));
  if (offKind !== undefined) {
    return `--kind ${offKind} pushes nothing until DEMI_PUSH_OPT_IN_KINDS includes ${KINDS[offKind].optIn}`;
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
  // A project push resets DEMI's read and runs a cascade that can outlast the per-attempt timeout.
  if (args.kinds.includes('project') && args.concurrency > 1) {
    return 'The project kind runs with --concurrency 1';
  }
  if (args.kinds.includes('project') && args.live && !args.idsFile) {
    return 'A live project run needs --ids-file: each project push makes DEMI update every document under it';
  }
  if (!Number.isFinite(args.rate) || args.rate < 1) {
    return '--rate takes a number of calls per minute, 1 or more';
  }
  if (args.since && Number.isNaN(args.since.getTime())) {
    return '--since takes an ISO date, e.g. 2026-01-01';
  }
  // Schema paths are registered by the app_helper require, so this needs no connection.
  const undated = args.since && args.kinds.map(name => KINDS[name])
    .find(kind => dateFields(mongoose.model(kind.model), kind.sinceFields).length === 0);
  if (undated) {
    return noSinceField(undated);
  }
  return null;
}

async function runKind(args, name) {
  const kind = KINDS[name];
  const plan = planKind(args, name);

  const model = mongoose.model(kind.model);
  if (plan.lastId) {
    scriptLog.info(`[demi-repush] resuming ${name} after _id ${plan.lastId}`);
  }
  if (plan.failedIds.length > 0) {
    scriptLog.warn(`[demi-repush] skipping ${plan.failedIds.length} ${name} ids that failed in an earlier run; retry them with --ids-file and another --state: ${plan.failedIds.join(', ')}`);
  }

  const job = kindJob(args, name, plan, model);

  const counts = await repush({
    cursor: kindQuery(model, job.query).cursor(),
    reopen: lastId => kindQuery(model, job.queryAfter(lastId)).cursor(),
    push: doc => demiPush[kind.push](doc),
    log: scriptLog,
    concurrency: args.concurrency,
    limit: args.limit,
    dryRun: !args.live,
    onCheckpoint: plan.statePath ? (id, running) => writeState(plan.statePath, job.checkpoint(id, running)) : null
  });

  if (args.live) {
    scriptLog.info(`[demi-repush] ${name} done: ${counts.seen} seen, ${counts.pushed} pushed, ${counts.failed} failed`);
    if (counts.failed > 0) {
      scriptLog.error(`[demi-repush] ${name} failed ids: ${counts.failedIds.join(', ')}`);
    }
  } else {
    scriptLog.info(`[demi-repush] [dry-run] ${counts.seen} ${name} records would be pushed; nothing sent`);
  }
  return counts;
}

// Kinds run one after another, so a parent kind listed first lands before its children. A kind
// with failures stops the run, since children of a failed parent would all be refused.
async function runKinds(args, runOne, log) {
  let failed = 0;
  for (const [i, name] of args.kinds.entries()) {
    const kindFailed = (await runOne(args, name)).failed;
    failed += kindFailed;
    const rest = args.kinds.slice(i + 1);
    if (kindFailed > 0 && rest.length > 0 && !args.continueOnFailure) {
      log.error(`[demi-repush] stopping: ${kindFailed} ${name} failed, so ${rest.join(', ')} not run; fix and rerun, or pass --continue-on-failure`);
      break;
    }
  }
  return { failed };
}

async function run(args) {
  const uri = buildMongoUri();
  // Naming the target guards against backfilling from the wrong database; the password stays out.
  scriptLog.info(`[demi-repush] connecting to ${uri.replace(/\/\/[^@]+@/, '//')}`);
  await mongoose.connect(uri, mongooseOptions);

  pushClient.setPacer(pacerFor(args));
  const counts = await runKinds(args, runKind, scriptLog);

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

  if (args.idsFile) {
    try {
      args.ids = readIds(args.idsFile);
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
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
    scriptLog.error(`[demi-repush] run failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

module.exports = {
  KINDS,
  MAX_CURSOR_REOPENS,
  USAGE,
  buildQuery,
  dateFields,
  kindQuery,
  pacerFor,
  parseArgs,
  kindJob,
  planKind,
  rateMeter,
  readIds,
  readState,
  repush,
  runKinds,
  statePathFor,
  validate,
  writeState
};
