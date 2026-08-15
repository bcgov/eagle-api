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
