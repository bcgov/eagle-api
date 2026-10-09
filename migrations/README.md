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

### Migrations that touch DEMI mirrored records

DEMI keeps a copy of most Eagle records. eagle-api sends that copy when a controller writes the
record (`api/helpers/demiPush.js`). A migration writes Mongo directly, so nothing is sent. Each push
carries the whole stored record, so a change to any field leaves DEMI behind until the record is
pushed again.

The mirrored types are the `schemaName` values in `KINDS` in `scripts/demi-repush.js`, plus `List`.
A migration that names one of them carries a paragraph starting `DEMI:` in its header comment:

- For a `KINDS` type, name `scripts/demi-repush.js` and each kind as `--kind <kind>` or
  `--kinds a,b`. Add `--ids-file` or `--since` when the change is narrow.
- For `List`, name eagle-demi's `seed-public-reads.js --only lists`. eagle-api never pushes List
  rows, so that script is the only way DEMI gets them. When the migration renames List entries, also
  re-push the projects and documents that use them (`--kinds project,document`): DEMI copies List
  names into document labels and project fields.
- When DEMI needs nothing, write `DEMI: none` and the reason.

```js
// DEMI: re-push with scripts/demi-repush.js --kind document --since 2026-10-01 once this has run.
```

`Config` needs no note: eagle-api pushes it again on the next `GET /api/config`.

`test/migrations/demi-mirror-note.test.js` fails `yarn test` when a migration dated
`20260923000000` or later names a mirrored type without a note that covers it. It reads the file
text, so a type name built at run time slips past it. Older migrations are not checked.

Run the re-push once the migration has run on that environment, with the order and warnings in the
`scripts/demi-repush.js` section below.

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

**Every push sends Eagle's `read`.** Each kind rebuilds the DEMI row's access from Eagle's `read[]`,
and a project push also re-cascades its documents. Since eagle-demi #545, a project or document that
DEMI has narrowed or taken down keeps its lower access level through a push, so a re-push no longer
undoes those takedowns. Other kinds have no such hold. Before any live run, remove from every id
file:

- ids of other kinds with a `record.takedown` or `record.narrow` row in the DEMI audit log;
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
  `organization`, `projectNotification`, `recentActivity` (Updates), `user`, `group`,
  `inspection`, `inspectionElement`, `inspectionItem`. The `project` kind needs
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
  the legislation blocks, so the filter is on `legislation_*.dateUpdated`; a projectNotification,
  user or group has no update stamp and the script refuses `--since` for it rather than quietly
  matching everything.
- `--limit N` — stop after N records of each kind. Good for a first `--live` pass on a handful.
- `--state <path>` — checkpoint file, written after every settled batch. A rerun with the same path
  starts after the last `_id` it holds, so an `oc exec` session that drops can be resumed instead of
  restarted. It also skips the ids under `failedIds`; retry those with `--ids-file` and another
  `--state` path. Write it somewhere the pod can keep, e.g. `/tmp/demi-repush-project.json`; a pod
  restart loses it and the next run starts from the top, which is harmless. With `--kinds`, each
  kind gets its own file, named with the kind before the extension (`/tmp/r.project.json`), so a
  checkpoint from an earlier single-kind run is not reused. The checkpoint records a hash and count
  of the id list and the `--since` date; a run over a different list or date starts from the top.
- `--concurrency N` — pushes in flight, default 4. The `project` kind only runs at 1: a project push
  makes DEMI update every document under it, which can outlast the 10 s limit per attempt, and the
  retry then starts a second update of the same project.

Pushes need `DEMI_API_BASE` and `DEMI_APIM_KEY`, the same pair `demiPush` runs on. Without them the
script exits 2 instead of reporting a run that sent nothing. The `user`, `group`, `inspection`,
`inspectionElement` and `inspectionItem` kinds also need `DEMI_PUSH_OPT_IN_KINDS` to list their
DEMI route segment (`users`, `groups`, `inspections`, `inspection-elements`, `inspection-items`);
the live pods push them only on the same condition. Without it the script exits 2 for that kind.

- `DEMI_PUSH_CONCURRENCY` (default 8): pushes in flight per process, `--concurrency` included.
- `DEMI_PUSH_QUEUE_MAX` (default 1000): pushes waiting; past it, `push-dropped <kind> <id>: queue full`.

A record DEMI does not accept is counted as failed, named in the log and listed under `failedIds` in
the state file. The run carries on, and the checkpoint still moves past it, so a rerun neither
re-pushes the records that landed nor retries the failed ones. A resume keeps the earlier
`failedIds` in the state file and skips them. To retry them, fix the cause (a parent kind not pushed
yet, say) and pass them in an `--ids-file` with a `--state` path of its own: a run over a different
id list starts its state file over, which would drop the first run's `failedIds`. The run summary, `N seen, N pushed, N failed`, counts
this run only.

The script reads each kind 100 records at a time, so the server cursor never sits idle long enough
for Mongo's 10-minute timeout to drop it. If the server drops it anyway (`cursor id ... not found`),
the script reopens it after the last `_id` read and logs a warning, up to 3 times in a row.

A `429` from APIM is retried up to 3 times, waiting as long as its `Retry-After` header asks
(at least 1 s, at most 60 s, plus up to 1 s of jitter). In this script no other push starts until
that wait is over, including pushes already queued for a slot. A `5xx` or network error is retried
once after about 1 s. Anything else below 500, such as `404` or `409`, is not retried.

Every push that never landed logs one error line with the marker `push-dropped`, for example
`[demiPush] push-dropped documents <id>: rejected 404`. That covers a push DEMI refused, one that ran
out of retries, one that failed before it was sent (the re-read after the write, or building the
body), and one still in flight or waiting to retry when a pod shuts down cleanly. A pod that is
killed without the shutdown path running logs nothing for its in-flight pushes.

A `404` because the parent project, notification or comment period is not in DEMI yet is held, not
dropped. The pod keeps the record in memory and sends it again once that pod pushes the parent, or
after 30 s and again after 5 min, for a parent another pod pushed. Held records count toward
`DEMI_PUSH_QUEUE_MAX`. When the last try is refused, or the pod shuts down cleanly with records
still held, it logs `push-dropped <kind> <id>: rejected 404 (parent not found)`. A pod killed
without the shutdown path loses held records with no log line.

This script's lines are in its own output. Live pods log them too; collect them from every replica,
since each pod only logs its own pushes:

```bash
oc --context epic-test -n 6cdc9e-test logs -l app.kubernetes.io/name=eagle-api,app.kubernetes.io/instance=eagle-api \
  --prefix --tail=-1 > eagle-api.log
grep -o 'push-dropped [a-z]* [0-9a-f]\{24\}' eagle-api.log | awk '{print $3}' | sort -u > ids.txt
```

The line names DEMI's route (`projects`, `documents`, `commentperiods`, ...), so grep one route at a
time to build a file per kind. Before feeding `ids.txt` back into a live run, remove the ids listed
above: a dropped push is not proof the record should be
widened. Pod logs only reach back to the last restart. For older drops, query Log Analytics if the
environment ships eagle-api logs there.

Exit codes, so a wrapper can tell a partial backfill from a clean one: 0 everything pushed, 1 the run
itself failed, 2 bad arguments or DEMI not configured, 3 the run finished with records DEMI did not
accept. The first log line names the database it connected to, without the password.

### scripts/dedupe-project-pins.js — remove repeated project pins

Adding pins to a project used `$push`, so a nation added twice was stored twice in `pins`. Eagle's
pin list hides the repeats, but the DEMI push sent one pin per entry, so the public site listed the
same nation more than once. Adding pins now uses `$addToSet`, and the push drops repeats too; this
script repairs the projects stored before that.

It finds every project whose `pins` holds an id more than once. With no flag it is a dry run: it logs
each project's `_id`, name, and its pin count before and after. `--apply` sets `pins` to the list
with each id once, the first copy kept in its place, and then pushes the project to DEMI through
`api/helpers/demiPush.js`, the same helper `demi-repush.js` uses. Its only write is `$set` of `pins`;
nothing is deleted. A project whose pins changed between the read and the write is skipped and
logged, and a rerun picks it up.

```bash
# what would change
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/dedupe-project-pins.js

# fix Mongo and DEMI
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/dedupe-project-pins.js --apply
```

`--apply` needs `DEMI_API_BASE` and `DEMI_APIM_KEY`, else it exits 2 before any write. Where
eagle-api has no DEMI, as on dev, add `--no-demi`: it fixes Mongo and skips the re-push, and says so
once in the log. With DEMI set, `--no-demi` still skips the push and logs a warning, because DEMI then
keeps the repeated pins. Exit codes: 0 done, 1 the run failed, 2 bad arguments or DEMI not
configured, 3 a project was skipped or DEMI did not accept its push.

```bash
# dev: Mongo only
oc --context epic-dev -n 6cdc9e-dev exec deploy/eagle-api -- node scripts/dedupe-project-pins.js --apply --no-demi
```

The script's lines go to stdout at `info` whatever `LOG_LEVEL` is set, so a run on prod
(`LOG_LEVEL=error`) still shows them. `demi-repush.js` and `normalise-audit-action.js` do the same.

### List entries — eagle-demi's seed-public-reads.js

`demi-repush.js` has no List kind. eagle-api has no List write controller, so it pushes no List
rows. After a migration that changes `List` rows, run eagle-demi's
`src/scripts/seed-public-reads.js --only lists`. It is a dry run until `--live`, reads from
`EAGLE_API_BASE` and writes the Cosmos database the process starts with; usage is in that file's
header.

When the migration renames List entries, restart eagle-api, then re-push the projects and documents
that use them with `demi-repush.js --kinds project,document`. A running pod caches List entries until
it restarts, so its pushes would send the old names until then.
