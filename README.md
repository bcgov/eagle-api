# bcgov / eagle-api

[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)

API for acting as a central authenticated data service for all EPIC front-ends

## Documentation

All documentation has been consolidated in the [Eagle Documentation Wiki](https://github.com/bcgov/eagle-dev-guides/wiki):

* **[API Architecture](https://github.com/bcgov/eagle-dev-guides/wiki/API-Architecture)** - Service map, routing patterns, and request flow
* **[Configuration Management](https://github.com/bcgov/eagle-dev-guides/wiki/Configuration-Management)** - ConfigService pattern and environment variables
* **[Analytics Architecture](https://github.com/bcgov/eagle-dev-guides/wiki/Analytics-Architecture)** - Penguin Analytics integration
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
* <https://github.com/bcgov/penguin-analytics> (analytics service)

## Quick Start

**Requirements**: Node 24.x, Yarn 4.x, Docker

```bash
# 1. Install dependencies
yarn install

# 2. Configure environment
cp .env.example .env

# 3. Start MongoDB
yarn db:up

# 4. First time only: initialise MongoDB replica set (required for Change Streams)
docker compose exec mongodb mongosh --eval "rs.initiate()"

# 5. First time only: restore data
yarn db:restore < epic-prod-dump.archive

# 6. Start the API
yarn start
```

API available at `http://localhost:3000`
Swagger UI at `http://localhost:3000/api/docs/`

For watch mode (auto-restart on changes): `yarn start-watch`

To stop all services: `yarn db:down`

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

One can run the EPIC applications on two kinds of data; generated and backed-up-from-live.

Generated data will typically be cleaner as it is generated against the latest mongoose models.  Generated data also does not require transferring PI to dev machines.  Live production dumps should only be used in situations where a particular bug cannot be replicated locally, and after replicating, the data generators and unit tests should be updated to include that edge case.

#### Generate data

Described in [generate README](generate.md)

#### Restoring from a live backup

Acquire a dump of the database from one of the live environments.

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

## Developing

See [Code Reuse Strategy](https://github.com/bcgov/eagle-dev-guides/dev_guides/code_reuse_strategy.md)

## Environment Variables

See `.env.example` for all available environment variables with descriptions and local defaults.

Key variables for local development:
- `KEYCLOAK_ENABLED=false` — disables Keycloak, uses local JWT with `SECRET`
- `MONGODB_SERVICE_HOST=localhost` — MongoDB host (default: localhost)
- `MONGODB_DATABASE=epic` — database name

Full reference: [Configuration Management](https://github.com/bcgov/eagle-dev-guides/wiki/Configuration-Management) wiki.

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