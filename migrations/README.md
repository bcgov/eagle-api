## How to run migrations

Migrations are run by `run_migration.js` (`yarn migrate`), which holds the migrate-mongo config
inline and seeds the `changelog` collection from the legacy db-migrate `migrations` collection on
first run. There is no `migrate-mongo-config.js`, so the bare `migrate-mongo` CLI does not work.

### Locally, against a port-forward

```bash
oc port-forward -n 6cdc9e-dev svc/eagle-api-mongodb 27017:27017

# Credentials are required — the cluster's MongoDB runs with --auth
export MONGODB_USERNAME=$(oc --context epic-dev get secret eagle-api-mongodb -n 6cdc9e-dev \
  -o jsonpath='{.data.MONGODB_USER}' | base64 -d)
export MONGODB_PASSWORD=$(oc --context epic-dev get secret eagle-api-mongodb -n 6cdc9e-dev \
  -o jsonpath='{.data.MONGODB_PASSWORD}' | base64 -d)

API_HOSTNAME=eagle-dev.apps.silver.devops.gov.bc.ca node run_migration.js
```

`API_HOSTNAME` is required by any migration that has to know which environment it is seeding. The
host defaults to `mongodb://localhost:27017/epic`, which is what the port-forward gives you, but the
credentials do not default to anything usable: the cluster runs mongod with `--auth --keyFile`
(`helm/eagle-api/templates/mongodb-deployment.yaml:33-40`), so without the two exports above the
first query fails. Other overrides: `MONGODB_SERVICE_HOST`, `MONGODB_PORT`, `MONGODB_DATABASE`,
`MONGODB_AUTHSOURCE`.

Against a local docker-compose Mongo instead — which runs with no auth — the bare command works:
`yarn db:up`, then `yarn migrate`.

### In-cluster

```bash
oc --context epic-dev exec -n 6cdc9e-dev deploy/eagle-api -- node run_migration.js
```

Preferred over the Helm pre-upgrade hook. The app pod already has `API_HOSTNAME` and the MongoDB
host/database via `envFrom` on the `eagle-api` ConfigMap, plus the credentials from the
`eagle-api-mongodb` secret, and it runs the image that is actually deployed. The hook (`helm/eagle-api/templates/migration-job.yaml`, enabled by
`migrations.enabled=true`) has two traps:

- the command documented at `helm/eagle-api/values.yaml:132` omits `--values values-{env}.yaml`, so
  the ConfigMap re-renders without `API_HOSTNAME` and the migration throws;
- `migrations.image.tag` is pinned to `"v2.10.42"`, so the `| default .Values.image.tag` fallback
  never fires and the job silently runs an image older than the migration you just wrote.

### Writing a migration

Add a `YYYYMMDDHHMMSS-name.js` file to this directory exporting `up(db, client)` and
`down(db, client)`. Nothing generates the boilerplate; copy the newest file.

Test it against a dump before it goes anywhere real:

```bash
cd dumps_folder && mongorestore -d epic some_unzipped_dump/
cd eagle_api_root && node run_migration.js
```

To re-run one locally, delete its `changelog` entry in the mongo shell and run again. This does not
unclobber data — restore the dump if the last attempt mangled it.

```js
db.changelog.find()
db.changelog.deleteOne({ fileName: '20190625114200-myMigrationName.js' })
```

## One-off scripts outside this directory

`scripts/` holds data fixes too slow for the pre-upgrade hook, where a long update would stall the
deploy — `audit` alone is ~22M rows in prod. They read the same `MONGODB_*` env vars as
`run_migration.js`, are safe to re-run, and each has `--help`.

`scripts/normalise-audit-action.js` lowercases `action` on audit rows. The report pipelines under
`api/materialized_views/reports/` match lowercase only, so run it on an environment as the API that
writes lowercase goes out; until it has, those reports omit rows written earlier. The 14-day change
counts go the other way and over-report, counting pre-deploy `Get`/`Search`/`Summary` reads as
changes, so run the script right after the deploy — the next rolling recompute then settles both.
`--dry-run` reports which values and how many rows would change, and writes nothing.

```bash
oc --context epic-dev exec -n 6cdc9e-dev deploy/eagle-api -- node scripts/normalise-audit-action.js --dry-run
oc --context epic-dev exec -n 6cdc9e-dev deploy/eagle-api -- node scripts/normalise-audit-action.js
```

Swap context and namespace for test. Prod takes the same command under your own login.

### scripts/demi-repush.js — re-push records to DEMI

`api/helpers/demiPush.js` mirrors a record to DEMI every time a controller writes one. The push body
is not what Mongo stores: for a project the helper resolves `applicableRegulation` to its List entry,
turns `pins` into `{_id, name, province}` objects, flattens `featuredDocuments` to ids, and adds
`proponentId` / `proponentName` inside each legislation block. A DEMI row that was seeded some other
way, or written before the mirror existed, has none of that, and nothing re-sends a record that
nobody has edited since.

`scripts/demi-repush.js` walks a collection in `_id` order and pushes each record through the same
helper, so the enrichment is identical to a controller write. It is a dry run by default: it reports
how many records match and sends nothing until `--live`.

**Every push replaces DEMI's `read`.** Each kind, not only projects, rebuilds the row's access from
Eagle's `read[]`. A re-push undoes any DEMI takedown or narrowed access on that record, and a project
push also re-cascades its documents. Before any live run, remove from every id file, projects and
children alike:

- ids with a `record.takedown` or `record.narrow` row in the DEMI audit log;
- ids that are both a hidden notification in DEMI and a Track project id.

**`recentActivity` sends email.** A pushed Update emails subscribers for every published update not
yet announced, unless DEMI includes #448 (`3066c99`, the 7-day notify window). #448 is on test and
not on prod, so do not re-push `recentActivity` on prod until it is.

Run parents before children: `project`, then `projectNotification`, then `document`; and
`commentPeriod` before `comment`. Projects run on their own, one at a time. The steps and the prod
rate are in the wiki's
[DEMI re-push](https://github.com/bcgov/eagle-dev-guides/wiki/Deployment-Pipeline#demi-re-push-after-a-push-shape-change)
section.

```bash
# what would be sent
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/demi-repush.js \
  --kind project --concurrency 1 --ids-file /tmp/project-ids.txt

# send it
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/demi-repush.js \
  --kind project --concurrency 1 --ids-file /tmp/project-ids.txt --state /tmp/repush-project.json --live
```

`yarn demi:repush` is the same entry point for a local run against a port-forwarded database.

Options, in full under `--help`. A flag with a missing or empty value, or followed straight by
another flag (an unset `$IDS` in `--ids-file $IDS --live`), exits 2 rather than widening the run.

- `--kind` — required, or `--kinds`: `project`, `document`, `commentPeriod`, `comment`,
  `organization`, `projectNotification`, `recentActivity` (Updates). The `project` kind needs
  `--concurrency 1`, and `--ids-file` when live.
- `--kinds a,b` — several kinds, run one after another in the order given; not together with
  `--kind`. List parents first so they land before their children. The run stops after a kind with
  failures, because the children of a failed parent would all be refused; `--continue-on-failure`
  goes on anyway.
- `--ids-file <path>` — push only these records: 24-character Mongo ids separated by newlines,
  spaces or commas. Any other value stops the run with exit 2. Each kind picks out its own ids, so
  one file can serve several kinds.
- `--rate N` — HTTP calls per minute, at least 1, default 150. Every call counts, retries included.
  The APIM machine subscription allows 300 calls a minute and the live pods share it. The live pods
  are not paced, and prod live traffic has not been measured, so start lower on prod (e.g.
  `--rate 60`) and raise it only while no `429` shows up.
- `--since <ISO>` — only records stamped at or after the date. A project keeps its timestamps inside
  the legislation blocks, so the filter is on `legislation_*.dateUpdated`; a projectNotification has
  no update stamp and the script refuses `--since` for it rather than quietly matching everything.
- `--limit N` — stop after N records of each kind. Good for a first `--live` pass on a handful.
- `--state <path>` — checkpoint file, written after every settled batch. A rerun with the same path
  starts after the last `_id` it holds, so an `oc exec` session that drops can be resumed instead of
  restarted. Write it somewhere the pod can keep, e.g. `/tmp/demi-repush-project.json`; a pod
  restart loses it and the next run starts from the top, which is harmless. With `--kinds`, each
  kind gets its own file, named with the kind before the extension (`/tmp/r.project.json`), so a
  checkpoint from an earlier single-kind run is not reused. The checkpoint records a hash and count
  of the id list and the `--since` date; a run over a different list or date starts from the top.
- `--concurrency N` — pushes in flight, default 4. The `project` kind only runs at 1: a project push
  makes DEMI update every document under it, which can outlast the 10 s limit per attempt, and the
  retry then starts a second update of the same project.

Pushes need `DEMI_API_BASE` and `DEMI_APIM_KEY`, the same pair `demiPush` runs on. Without them the
script exits 2 instead of reporting a run that sent nothing.

A record DEMI does not accept is counted as failed, named in the log and listed under `failedIds` in
the state file. The checkpoint then stops advancing: it holds at the last record with nothing failed
behind it, so a rerun starts before the gap rather than past it, re-pushing the records after it.
Every DEMI write is a PUT on the record id, so pushing a record twice lands the same row, and the run
summary, `N seen, N pushed, N failed`, is the whole story.

A `429` from APIM is retried up to 3 times, waiting as long as its `Retry-After` header asks
(at least 1 s, at most 60 s, plus up to 1 s of jitter). In this script no other push starts until
that wait is over, including pushes already queued for a slot. A `5xx` or network error is retried
once after about 1 s. Anything else below 500, such as `404` or `409`, is not retried.

Every push that never landed logs one error line with the marker `push-dropped`, for example
`[demiPush] push-dropped documents <id>: rejected 404`. That covers a push DEMI refused, one that ran
out of retries, one that failed before it was sent (the re-read after the write, or building the
body), and one still in flight or waiting to retry when a pod shuts down cleanly. A pod that is
killed without the shutdown path running logs nothing for its in-flight pushes.

This script's lines are in its own output. Live pods log them too; collect them from every replica,
since each pod only logs its own pushes:

```bash
oc --context epic-test -n 6cdc9e-test logs -l app.kubernetes.io/name=eagle-api,app.kubernetes.io/instance=eagle-api \
  --prefix --tail=-1 > eagle-api.log
grep -o 'push-dropped [a-z]* [0-9a-f]\{24\}' eagle-api.log | awk '{print $3}' | sort -u > ids.txt
```

The line names DEMI's route (`projects`, `documents`, `commentperiods`, ...), so grep one route at a
time to build a file per kind. Before feeding `ids.txt` back into a live run, remove the takedown,
narrow and hidden-notification ids listed above: a dropped push is not proof the record should be
widened. Pod logs only reach back to the last restart. For older drops, query Log Analytics if the
environment ships eagle-api logs there.

Exit codes, so a wrapper can tell a partial backfill from a clean one: 0 everything pushed, 1 the run
itself failed, 2 bad arguments or DEMI not configured, 3 the run finished with records DEMI did not
accept. The first log line names the database it connected to, without the password.
