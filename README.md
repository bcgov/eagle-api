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

For deployment procedures, Helm charts, and CI/CD workflows, see the [Deployment Guide](https://github.com/bcgov/eagle-dev-guides/wiki/Deployment-Pipeline) in the Eagle documentation wiki.

## Database

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

## Environment Variables

Run the automated setup script:

```bash
./install_prerequisites.sh
```

For manual configuration or custom settings, key environment variables include:
- `KEYCLOAK_ENABLED=true`
- `MONGODB_DATABASE='epic'`

Additional configuration details are available in the [Configuration Management](https://github.com/bcgov/eagle-dev-guides/wiki/Configuration-Management) wiki page.

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