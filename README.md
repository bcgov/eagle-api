# bcgov / eagle-api

API for acting as a central authenticated data service for all EPIC front-ends

## Related projects

Eagle is a revision name of the EAO EPIC application suite.

These projects comprise EAO EPIC:

* <https://github.com/bcgov/eagle-api>
* <https://github.com/bcgov/eagle-public>
* <https://github.com/bcgov/eagle-admin>
* <https://github.com/bcgov/eagle-mobile-inspections>
* <https://github.com/bcgov/eagle-common-components>
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

## Pull Request Pipeline

The EPIC project is built with a Pull Request based pipeline, a full set of builds and deployments will be created in Openshift. In order to link features or related code across eagle repositories (admin, public, and api) the branch names for each PR **MUST** be the same in each of the repositories. A status badge will be updated with a live link when the Pull Request has been built and deployed.

Before closing a pull request the deployment should be cleaned up using the clean-up stage in [Jenkins](https://jenkins-prod-esm.pathfinder.gov.bc.ca/). If a pull request is not cleaned up before merging the branch a manual cleanup must be done. The script [pr-cleanup-helper.sh](https://github.com/bcgov/eagle-helper-pods/blob/master/openshift/setup-teardown/pr-cleanup-helper.sh) will populate templates with the branch name in order to use the teardown script, [teardown-all.sh](https://github.com/bcgov/eagle-helper-pods/blob/master/openshift/setup-teardown/teardown-all.sh)

A full description and guide to the EPIC pipeline and branching strategy is available in the [eagle-dev-guides](https://github.com/bcgov/eagle-dev-guides/blob/master/dev_guides/pull_request_pipeline.md) repository.

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

## Testing

An overview of the EPIC test stack can be found [here](https://github.com/bcgov/eagle-dev-guides/blob/master/dev_guides/testing_components.md).

This project is using [jest](http://jestjs.io/) as a testing framework. You can run tests with
`node_modules/.bin/jest`. Running with the `--watch` flag will re-run the tests every time a file is changed.

To run the tests in one file, simply pass the path of the file name e.g. `node_modules/.bin/jest ./api/test/yourtestfile.test.js --watch`. To run only one test in that file, chain the `.only` command e.g. `test.only("Search returns results", () => {})`.

The tests that are present are called in the deployment pipeline and will fail a build if they fail.  Better to run the above tests locally as part of your development cycle.

This project's test environment is inherited from the [ACRFD](https://github.com/bcgov/nrts-prc-api) test suite along with most of the project code itself.  When testing the API functionality, it is important to understand the mock router setup. When ACRFD was authored, it wasn't possible to get [swagger-tools](https://github.com/apigee-127/swagger-tools) router working in the test environment. As a result, all tests **_COMPLETELY bypass_ the real life swagger-tools router**. Instead, a middleware router called [supertest](https://github.com/visionmedia/supertest) is used to map routes to controller actions. In each controller test, you will need to add code like the following:

```javascript
const test_helper = require('./test_helper');
const app = test_helper.app;
const featureController = require('../controllers/feature.js');
const fieldNames = ['tags', 'properties', 'applicationID'];

app.get('/api/feature/:id', function(req, res) {
  let params = test_helper.buildParams({'featureId': req.params.id});
  let paramsWithFeatureId = test_helper.createPublicSwaggerParams(fieldNames, params);
  return featureController.protectedGet(paramsWithFeatureId, res);
});

test("GET /api/feature/:id  returns 200", done => {
  request(app)
    .get('/api/feature/AAABBB')
    .expect(200)
    .then(done)
});
```

This code will stand in for the swagger-tools router, and help build the objects that swagger-tools magically generates when HTTP calls go through it's router. The above code will send an object like below to the `api/controllers/feature.js` controller `protectedGet` function as the first parameter (typically called `args`).

```javascript
{
  swagger: {
    params: {
      auth_payload: {
        scopes: ['sysadmin', 'public'],
        userID: null
      },
      fields: {
        value: ['tags', 'properties', 'applicationID']
      },
      featureId: {
        value: 'AAABBB'
      }
    }
  }
}
```

Unfortunately, this results in a lot of boilerplate code in each of the controller tests. There are some helpers to reduce the amount you need to write, but you will still need to check the parameter field names sent by your middleware router match what the controller(and swagger router) expect. However, this method results in  pretty effective integration tests as they exercise the controller code and save objects in the database.

## Test Database

The tests run on an in-memory MongoDB server, using the [mongodb-memory-server](https://github.com/nodkz/mongodb-memory-server) package. The setup can be viewed at [test_helper.js](api/test/test_helper.js), and additional config in [config/mongoose_options.js]. It is currently configured to wipe out the database after each test run to prevent database pollution.

[Factory-Girl](https://github.com/aexmachina/factory-girl) is used to easily create models(persisted to db) for testing purposes.

## Mocking http requests

External http calls (such as GETs to BCGW) are mocked with a tool called [nock](https://github.com/nock/nock). Currently sample JSON responses are stored in the [test/fixtures](test/fixtures) directory. This allows you to intercept a call to an external service such as bcgw, and respond with your own sample data.

```javascript
  const bcgwDomain = 'https://openmaps.gov.bc.ca';
  const searchPath = '/geo/pub/FOOO';
  const crownlandsResponse = require('./fixtures/crownlands_response.json');
  var bcgw = nock(bcgwDomain);
  let dispositionId = 666666;

  beforeEach(() => {
    bcgw.get(searchPath + urlEncodedDispositionId)
      .reply(200, crownlandsResponse);
  });

  test('returns the features data from bcgw', done => {
    request(app).get('/api/public/search/bcgw/dispositionTransactionId/' + dispositionId)
      .expect(200)
      .then(response => {
        let firstFeature = response.body.features[0];
        expect(firstFeature).toHaveProperty('properties');
        expect(firstFeature.properties).toHaveProperty('DISPOSITION_TRANSACTION_SID');
        done();
      });
  });
```

## Configuring Environment Variables

To get all your settings for this project automatically set up, run the file

```bash
#!/bin/bash
./install_prerequisites.sh
```

...or follow the following manual process if you require custom settings:

Recall the environment variables we need for local dev:

1. MINIO_HOST='foo.pathfinder.gov.bc.ca'
1. MINIO_ACCESS_KEY='xxxx'
1. MINIO_SECRET_KEY='xxxx'
1. KEYCLOAK_ENABLED=true
1. MONGODB_DATABASE='epic'

To get actual values for the above fields in the deployed environments, examine the openshift environment you wish to target:

```bash
#!/bin/bash
oc project [projectname]
oc get routes | grep 'minio'
oc get secrets | grep 'minio'
```

You will not be able to see the above value of the secret if you try examine it.  You will only see the encrypted values.  Approach your team member with admin access in the openshift project in order to get the access key and secret key values for the secret name you got from the above command.  Make sure to ask for the correct environment (dev, test, prod) for the appropriate values.
