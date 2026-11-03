# bcgov / eagle-api

[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)

API for acting as a central authenticated data service for all EPIC front-ends

## Documentation

All documentation has been consolidated in the [Eagle Documentation Wiki](https://github.com/bcgov/eagle-dev-guides/wiki):

* **[API Architecture](https://github.com/bcgov/eagle-dev-guides/wiki/API-Architecture)** - Service map, routing patterns, and request flow
* **[Configuration Management](https://github.com/bcgov/eagle-dev-guides/wiki/Configuration-Management)** - ConfigService pattern and environment variables
* **[Analytics Architecture](https://github.com/bcgov/eagle-dev-guides/wiki/Analytics-Architecture)** - eagle-analytics integration
* **[API Deployment](https://github.com/bcgov/eagle-dev-guides/wiki/API-Deployment)** - Deployment workflows and procedures
* **[Deployment Pipeline](https://github.com/bcgov/eagle-dev-guides/wiki/Deployment-Pipeline)** - CI/CD workflows and image tagging
* **[Rollback Procedures](https://github.com/bcgov/eagle-dev-guides/wiki/Rollback-Procedures)** - How to rollback deployments
* **[Troubleshooting](https://github.com/bcgov/eagle-dev-guides/wiki/Troubleshooting)** - Common issues and solutions

## Related projects

Eagle is a revision name of the EAO EPIC application suite.

These projects comprise EAO EPIC:

* <https://github.com/bcgov/eagle-api>
* <https://github.com/bcgov/eagle-public>
* <https://github.com/bcgov/eagle-admin>
* <https://github.com/bcgov/eagle-mobile-inspections>
* <https://github.com/bcgov/eagle-reports>
* <https://github.com/bcgov/eagle-helper-pods>
* <https://github.com/bcgov/eagle-dev-guides>
* <https://github.com/bcgov/eao-nginx> (rproxy reverse proxy)
* <https://github.com/digitalspace/eagle-analytics> (analytics service)

## Quick Start

**Requirements**: Node 24.15+, Yarn 4.12 through Corepack (`corepack enable`), Docker

```bash
# 1. Install dependencies
corepack enable
yarn install

# 2. Configure environment
cp .env.example .env

# 3. Start MongoDB (waits until the replica set is ready)
yarn db:up

# 4. Set up an empty database
API_HOSTNAME=eagle-dev.apps.silver.devops.gov.bc.ca yarn migrate

# 5. Start the API
yarn start
```

API available at `http://localhost:3000`
Swagger UI at `http://localhost:3000/api/docs/`

For watch mode (auto-restart on changes): `yarn start-watch`

To stop all services: `yarn db:down`

On an empty database, `yarn migrate` marks the pre-2026 migrations as applied, creates the text
index search needs, and runs the 2026 migrations. Those seed the Config document that
`/api/config` serves and a few `List` entries. The database holds no projects, documents or
users.

`API_HOSTNAME` picks the environment the Config document copies. The dev host gives dev values.

If `yarn start` fails with `ENOTFOUND` and a container id, your volume holds a replica set that
`rs.initiate()` created without a host. Fix it once:

```bash
docker compose exec mongodb mongosh --eval "c=rs.conf();c.members[0].host='localhost:27017';rs.reconfig(c,{force:true})"
```

### Local token

With `KEYCLOAK_ENABLED=false` the API accepts tokens signed with `SECRET` from `.env`. Mint a
sysadmin token and call a protected route:

```bash
export TOKEN=$(node -e "process.loadEnvFile(); console.log(require('./api/helpers/auth').issueToken({ username: 'local-dev', _id: '000000000000000000000001' }, 'local', ['sysadmin']))")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/comment
```

The call returns `[]` on an empty database. Without the header it returns 403.

## Testing

```bash
# Run unit tests once
yarn test

# Watch mode (re-runs on changes)
yarn test:watch

# Smoke tests (requires a running API at localhost:3000)
yarn test:smoke
```

Tests use **Mocha + Chai**. Test files are in the `test/` directory.

## Deployment

For deployment procedures, Helm charts, and CI/CD workflows, see the [Deployment Guide](https://github.com/bcgov/eagle-dev-guides/wiki/Deployment-Pipeline) in the Eagle documentation wiki.

## Database

Local development runs on the empty database that `yarn migrate` sets up.

Production dumps hold personal information: comment authors and locations, CAC member names and
emails, and user contact details (`api/helpers/models/comment.js`, `cacUser.js`, `user.js`). They are not
for laptops.

#### Restoring from a live backup

To restore a dump into your local MongoDB:

```bash
# Drop the existing database (destructive!)
mongosh --eval 'use epic; db.dropDatabase()'

# Restore from a dump directory
mongorestore -d epic epic/

# Or restore from a gzipped archive
mongorestore --gzip --archive=epic-dump.tar.gz
```

#### Restore into the docker compose container (recommended)

With `yarn db:up` running, pipe a mongodump archive directly into the container:

```bash
# From a mongodump --archive file
yarn db:restore < epic-prod-dump.archive

# Or stream directly from a live environment
mongodump --uri="<source-uri>" --archive | yarn db:restore
```

The `db:restore` script runs `mongorestore --drop` inside the container, so it
replaces any existing data. The volume (`eagle-api_mongodb-data`) persists across
`yarn db:down` / `yarn db:up` restarts.


### Database Migrations

Migrations live in `migrations/` and are run by `run_migration.js` (`yarn migrate`), which holds the
migrate-mongo config inline. The bare `migrate-mongo` CLI does not work — there is no
`migrate-mongo-config.js`.

See [migrations/README.md](migrations/README.md) for how to run them locally against a port-forward,
how to run them in-cluster with `oc exec`, and why that is preferred over the Helm `pre-upgrade` hook.

One-off data scripts live in `scripts/` and are described in the same file, including
`yarn demi:repush` (`scripts/demi-repush.js`), which re-sends existing records to DEMI through
`api/helpers/demiPush.js` so rows seeded without the push-only enrichment get it.
`scripts/dedupe-project-pins.js` removes repeated ids from project `pins` and re-pushes each
fixed project to DEMI.

## Environment Variables

See `.env.example` for all available environment variables with descriptions and local defaults.

Key variables for local development:
- `KEYCLOAK_ENABLED=false` — disables Keycloak, uses local JWT with `SECRET`
- `MONGODB_SERVICE_HOST=localhost` — MongoDB host (default: localhost)
- `MONGODB_DATABASE=epic` — database name
## Database Operations

### Enable MET Comment Periods for Project
1. Connect to Open Shift by copying login command
2. Choose project and get Pods
	`oc get pods`
3. Port-forward 
	`oc port-forward eagle-api-mongodb-5-tj22g 5555:27017`
4. Connect to db with mongoshell
	`mongo "mongodb://admin:pw@localhost:27017/epic?authSource=admin"`
5. Query for project 
  Eg.	`db.epic.find({_id : ObjectId("65c661a8399db00022d48849")})`
6. Set `hasMetCommentPeriods` to `true` for the project. 
  Eg.	`db.epic.updateOne( { _id: ObjectId("65c661a8399db00022d48849") }, { $set: { "legislation_2018.hasMetCommentPeriods": true } })`