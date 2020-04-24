# MongoDB migrations automation

This job will automatically execute the migration scripts found in the eagle-api migrations folder.

The job includes a Dockerfile and sh scripts for executing various parts of the migration process.

##### Why a Dockerfile?
Including a docker image allows us to install a local instance of mongodb and run the migrations in isolation from the live mongodb pod. This means if any issues occur during migration, we don't run the risk of damaging production data or requiring a rebuild and restore from a backup.

##### Can I run the process locally?
Yes. This process does not need to be deployed in openshift to function. You must have docker installed on your local machine, and provide the required openshift token for access when running locally. Note that the process will spin down the live API pod, so if you're running this in production be sure to double-check that the pod has been spun up correctly after the process has completed. For instructions on running the migration process locally, see "Running the migration on my local machine" below.

## Setup

you can run the process locally, deploy this manually into openshift, as a github action, or in a jenkins pipeline. You will need to setup the following OpenShift secrets:

##### Openshift Variables:

You will need to create NAME_SUFFIX, OC_URL, OC_TOKEN, and ROCKETCHAT_WEBHOOK OpenShift secrets/env variables

secrets:
```
env:
  - name: ROCKETCHAT_WEBHOOK
    valueFrom:
      secretKeyRef:
        key: ROCKETCHAT_WEBHOOK
        name: minio-rocketchat-webhook-${NAME_SUFFIX}
```
And environment variables:
```
parameters:
  - name: NAME_SUFFIX
    required: true
  - name: OC_URL
    required: true
  - name: OC_TOKEN
    required: true
```
### Running the migration on my local machine

Ensure you have docker installed. You will need to fetch your oc token from the openshift environment (defaulted to https://console.pathfinder.gov.bc.ca:8443/).

Navigate to the location where this job resides:
```
cd /eagle-api/openshift/templates/jobs/mongo-migrations
```
Build the docker image
```
docker build . --tag mongo-migrations:latest
```
If the build was successful, run the image to start the process.
```
docker run -e NAME_SUFFIX=<dev/test/prod> -e OC_URL=https://console.pathfinder.gov.bc.ca:8443/ -e OC_TOKEN=<token> -e ROCKETCHAT_WEBHOOK=<webhook> mongo-migrations:latest
```
### Manual openshift deploy Setup

##### Build in tools namespace:
```
oc process -f mongo-migrations.bc.yaml | oc create -f -
```

### Example usage in Jenkins pipeline:

```groovy
def mongoMigrations = openshift.process("-f",
    "openshift/jobs/mongo-migrations.bc.yaml",

    // values for the environment that this job will run in
    "NAME_SUFFIX=${prodSuffix}",
    "OC_URL=${openshiftUrl}",
    "OC_TOKEN=${token}"
)
```

### GitHub Action (WIP)

An action configuration can be found here in action.yaml. You can use this process as a github action by creating an action in your project. This will require setting tokens securely.

bcgov/eagle-api will require the secrets in place before the github action will deploy successfully. Secrets will not passed to workflows that are triggered by a pull request from a fork, so the best option for running this process as an action is a local PR (or some other workflow trigger) in the bcgov/eagle-api repository

```
on: [push]

jobs:
  mongo-migration:
    runs-on: ubuntu-latest
    name: Migrate updates to MongoDB
    steps:
    - name: run-migrations
      uses: bcgov/eagle-api/openshift/templates/jobs/mongo-migrations@master # use @develop for access to beta
      env:
        NAME_SUFFIX: 'dev' #dev, test, or prod
        OC_URL: ${{ secrets.OC_URL }}
        OC_TOKEN: ${{ secrets.OC_TOKEN }}
        ROCKETCHAT_WEBHOOK: ${{ secrets.ROCKETCHAT_WEBHOOK }}
```