# bcgov / eagle-api

[![Lifecycle:Stable](https://img.shields.io/badge/Lifecycle-Stable-97ca00)](https://github.com/bcgov/repomountie/blob/master/doc/lifecycle-badges.md)

API for acting as a central authenticated data service for all EPIC front-ends

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

## CI/CD Pipeline

The EPIC project has moved away from PR based pipeline due to complexity and reliability concerns of the PR based pipeline implementation. The current CI/CD pipeline utilizes Github Actions to build Docker images and push them back into the BC Gov OpenShift Docker registry.

A full description and guide to the EPIC pipeline and branching strategy is available in the [eagle-dev-guides](https://github.com/bcgov/eagle-dev-guides/blob/master/dev_guides/github_action_pipeline.md) repository.

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