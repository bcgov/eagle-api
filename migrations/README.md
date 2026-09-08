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

```bash
# what would be sent
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/demi-repush.js --kind project

# send it
oc --context epic-test -n 6cdc9e-test exec deploy/eagle-api -- node scripts/demi-repush.js --kind project --live
```

`yarn demi:repush` is the same entry point for a local run against a port-forwarded database.

Options, in full under `--help`:

- `--kind` — `project` (default), `document`, `commentPeriod`, `comment`, `organization`,
  `projectNotification`.
- `--since <ISO>` — only records stamped at or after the date. A project keeps its timestamps inside
  the legislation blocks, so the filter is on `legislation_*.dateUpdated`; a projectNotification has
  no update stamp and the script refuses `--since` for it rather than quietly matching everything.
- `--limit N` — stop after N records. Good for a first `--live` pass on a handful.
- `--state <path>` — checkpoint file, written after every settled batch. A rerun with the same path
  starts after the last `_id` it holds, so an `oc exec` session that drops can be resumed instead of
  restarted. Write it somewhere the pod can keep, e.g. `/tmp/demi-repush-project.json`; a pod
  restart loses it and the next run starts from the top, which is harmless.
- `--concurrency N` — pushes in flight, default 4.

Pushes need `DEMI_API_BASE` and `DEMI_APIM_KEY`, the same pair `demiPush` runs on. Without them the
script exits 2 instead of reporting a run that sent nothing.

A record DEMI does not accept is counted as failed, named in the log and listed under `failedIds` in
the state file. The checkpoint then stops advancing: it holds at the last record with nothing failed
behind it, so a rerun starts before the gap rather than past it, re-pushing the records after it.
That is safe — every DEMI write is a PUT on the record id — and it means the run summary,
`N seen, N pushed, N failed`, is the whole story.

Exit codes, so a wrapper can tell a partial backfill from a clean one: 0 everything pushed, 1 the run
itself failed, 2 bad arguments or DEMI not configured, 3 the run finished with records DEMI did not
accept. The first log line names the database it connected to, without the password.
