# bcgov / eagle-api

[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)

API for acting as a central authenticated data service for all EPIC front-ends

## Documentation

Comprehensive architecture and deployment documentation is available in the [docs](./docs) directory:

* **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Platform architecture overview
  * Service map and request routing
  * Why `/api` bypasses rproxy (direct route architecture)
  * nginx configuration and caching strategy
  * Security and authentication flows
  * Monitoring and health checks
  
* **[ANALYTICS_ARCHITECTURE.md](./docs/ANALYTICS_ARCHITECTURE.md)** - Analytics integration
  * Penguin Analytics service architecture
  * Why `/analytics` is separate from `/api` path
  * Event schema and TimescaleDB storage
  * Frontend integration (AnalyticsService pattern)
  * Performance considerations and troubleshooting
  
* **[CONFIGURATION.md](./docs/CONFIGURATION.md)** - Configuration management
  * ConfigService pattern with runtime config fetching
  * Environment variables reference (dev/test/prod)
  * Build-time vs runtime configuration
  * Secrets management in OpenShift
  
* **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Deployment workflows
  * OpenShift namespace structure (6cdc9e-tools/dev/test/prod)
  * GitHub Actions CI/CD pipeline
  * Helm chart deployment
  * Environment promotion workflow (dev → test → prod)
  * Rollback procedures and troubleshooting

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

## Pre-requisites

Note: The following commands work in MacOS bash (not zsh which now default in Catalina). The scripts are currently not fully working in Windows and Linux, so you may need to look at the source of the scripts and manually apply the commands in a right order.

Run the following two scripts to create your environment

```bash
#!/bin/bash
.\install_prerequisites.sh
```

```bash
#!/bin/bash
.\setup_project.sh
```

## Fork, Build and Run

Start the server by running `npm start`

For development you can use `npm run start-watch` to restart the server on code changes.

Check the swagger-ui on `http://localhost:3000/api/docs/`

1. POST `http://localhost:3000/api/login/token` with the following body

```json
{
"username": #{username},
"password": #{password}
}
```

 and take the token that you get in the response

 1. GET `http://localhost:3000/api/application` again with the following header
 ``Authorization: Bearer _TOKEN_``, replacing `_TOKEN_` with the value you got from that request

## Deployment

### Automated Deployments

The application uses GitHub Actions for CI/CD with S2I builds and OpenShift image tagging:

**Development (6cdc9e-dev)**
- **Trigger**: Automatic on push to `develop` branch
- **Workflow**: `.github/workflows/build_and_promote.yaml`
- **Process**: S2I build → Tags as `dev` and `<commit-sha>` → Tags in OpenShift
- **URL**: https://eagle-dev.apps.silver.devops.gov.bc.ca/api

**Test (6cdc9e-test)**
- **Trigger**: Manual via GitHub Actions UI
- **Workflow**: `.github/workflows/deploy-to-test.yaml`
- **Process**: 
  1. Go to Actions → "Deploy to Test" → "Run workflow"
  2. Enter image tag (default: `dev`) or specific commit SHA
  3. Workflow tags image as `test` in OpenShift
- **URL**: https://eagle-test.apps.silver.devops.gov.bc.ca/api

**Production (6cdc9e-prod)**
- **Trigger**: Manual via GitHub Actions UI
- **Workflow**: `.github/workflows/deploy-to-prod.yaml`
- **Process**:
  1. Go to Actions → "Deploy to Prod" → "Run workflow"
  2. Enter image tag (default: `test`) or specific commit SHA
  3. Workflow tags image as `prod` in OpenShift
- **URL**: https://eagle.gov.bc.ca/api

### Deployment Flow Example

```bash
# 1. Push to develop → auto-builds and tags as dev with SHA abc1234
git push origin develop

# 2. Manually promote to test (via GitHub UI)
#    - Select "Deploy to Test" workflow
#    - Input: abc1234 (or leave default "dev")
#    - Click "Run workflow"

# 3. Manually promote to production (via GitHub UI)
#    - Select "Deploy to Prod" workflow
#    - Input: abc1234 (or leave default "test")
#    - Click "Run workflow"
```

### Image Tagging in OpenShift

The eagle-api uses OpenShift image tagging for deployments:

```bash
# Dev build creates image in tools namespace
# Tag for test deployment
oc tag 6cdc9e-tools/eagle-api:dev 6cdc9e-tools/eagle-api:test

# Tag for prod deployment
oc tag 6cdc9e-tools/eagle-api:test 6cdc9e-tools/eagle-api:prod
```

The DeploymentConfigs in dev/test/prod namespaces reference images in the tools namespace.

### Database

One can run the EPIC applications on two kinds of data; generated and backed-up-from-live.

Generated data will typically be cleaner as it is generated against the latest mongoose models.  Generated data also does not require transferring PI to dev machines.  Live production dumps should only be used in situations where a particular bug cannot be replicated locally, and after replicating, the data generators and unit tests should be updated to include that edge case.

#### Generate data

Described in [generate README](generate.md)

#### Restoring from a live backup

Acquire a dump of the database from one of the live environments.

To make sure you don't have an existing old copy (careful, this is destructive):

```bash
#!/bin/bash
mongo
```

```mongo
use epic
db.dropDatabase()
```

##### Load database dump

1. Download and unzip archived dump file.
2. Restore the dump into your local mongo:

```bash
#!/bin/bash
mongorestore -d epic epic/
```


### Database Conversions

In the process of developing this application, we have database conversion scripts that must be run in order to update the db model so that the newest codebase can work properly.  There are currently two methods of doing the database conversion depending on how long-lived and memory intensive the conversion is.

### Method 1: db-migrate

### Method 2: node scripts named migration* in the root folder

### Method 1

See <https://www.npmjs.com/package/db-migrate> for documentation on running the db migrate command.  General use case for local development at the root folder:

```./node_modules/db-migrate/bin/db-migrate up```

For dev/test/prod environments, you will need to change the database.json file in the root folder accordingly and run with the --env param.  See <https://www.npmjs.com/package/db-migrate> for more information.

### Method 2

In the root folder, there are files named migrateDocuments*.js.  These are large, long-running, memory intensive scripts that operated on the vast majority of the EPIC documents.  As a result, db-migrate was slow and unreliable given the nature of the connection to our database.  As a result, these nodejs scripts operate using the mongodb driver in nodejs and can handle a more complicated, robust approach to doing the database conversion.  They can be run from your local machine as long as there is a ```oc port-forward``` tunnel from your machine to the openshift mongdb database.  Change the user/pass/port/host/authenticationDatabase params and the script will execute against the mongodb pod directly.

## Developing

See [Code Reuse Strategy](https://github.com/bcgov/eagle-dev-guides/dev_guides/code_reuse_strategy.md)

## Configuring Environment Variables

To get all your settings for this project automatically set up, run the file

```bash
#!/bin/bash
./install_prerequisites.sh
```

...or follow the following manual process if you require custom settings:

Recall the environment variables we need for local dev:

1. KEYCLOAK_ENABLED=true
1. MONGODB_DATABASE='epic'

To get actual values for the above fields in the deployed environments, examine the openshift environment you wish to target:

```bash
#!/bin/bash
oc project [projectname]
oc get routes
oc get secrets
```

You will not be able to see the above value of the secret if you try examine it.  You will only see the encrypted values.  Approach your team member with admin access in the openshift project in order to get the access key and secret key values for the secret name you got from the above command.  Make sure to ask for the correct environment (dev, test, prod) for the appropriate values.


## Enable MET Comment Periods for Project
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