const express = require('express');
const bodyParser = require('body-parser');
const DatabaseCleaner = require('database-cleaner');
const dbCleaner = new DatabaseCleaner('mongodb');
const mongoose = require('mongoose');
const mongooseOpts = require('../../../config/mongoose_options').mongooseOptions;
const mongoDbMemoryServer = require('mongodb-memory-server');
const MongoClient = require('mongodb').MongoClient;
const exec = require('child_process').exec;
const _ = require('lodash');
const fs = require('fs');

const app = express();
const defaultNumberOfProjects = 1;

let mongoServer;
let mongoUri = "";  // not initializing to localhost here on purpose - would rather error out than corrupt a persistent db
mongoose.Promise = global.Promise;
setupAppServer();

jest.setTimeout(10000);

beforeAll(async () => {
  let genSettings = await dataGenerationSettings;
  if (2 < genSettings.projects) jest.setTimeout(5000 * genSettings.projects);
  if (!genSettings.save_to_persistent_mongo) mongoServer = instantiateInMemoryMongoServer();
  await mongooseConnect();
  if (genSettings.generate) await checkMigrations(runMigrations);
});

beforeEach(async () => {
  await mongooseConnect();
});

afterEach(done => {
  dataGenerationSettings.then(genSettings => {
    if (mongoose.connection && mongoose.connection.db) {
      if (!genSettings.save_to_persistent_mongo) {
        dbCleaner.clean(mongoose.connection.db, () => {
          done();
        });
      } else {
        done();
      }
    } else {
      done();
    }
  });
});

afterAll(async () => {
  let genSettings = await dataGenerationSettings;
  if (mongoose.connection) await mongoose.disconnect();
  if ((mongoServer) && (!genSettings.save_to_persistent_mongo)) await mongoServer.stop();
});

function setupAppServer() {
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());
}

function checkMongoUri() {
  if ("" == mongoUri) throw "Mongo URI is not set";
}


function getDataGenerationSettings() {
  let filepath = '/tmp/generate.config';
  if (fs.existsSync(filepath)){
    return new Promise(resolve => {
      let fileContents = "";
      fs.readFileSync(filepath).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; })
      let jsonObj = JSON.parse(fileContents);
      jsonObj.projects = Number(jsonObj.projects);
      jsonObj.save_to_persistent_mongo = ("Saved" == jsonObj.data_mode);
      jsonObj.generate_consistent_data = ("Static" == jsonObj.seed_mode);
      jsonObj.generate = ("true" == jsonObj.generate);
      resolve(jsonObj);
    });   
  } else {
    return new Promise(resolve => {
      let jsonObj = {
        generate: false,
        projects: defaultNumberOfProjects,
        save_to_persistent_mongo: false,
        generate_consistent_data: true,
      };
      resolve(jsonObj);
    });   
  }
};

let dataGenerationSettings = getDataGenerationSettings();

function createSwaggerParams(fieldNames, additionalValues = {}, username = null) {
  let defaultParams = defaultProtectedParams(fieldNames, username);
  let swaggerObject = {
    swagger: {
      params: _.merge(defaultParams, additionalValues),
      operation:  {
        'x-security-scopes': ['sysadmin', 'public']
      }
    }
  }
  return swaggerObject;
}

function createPublicSwaggerParams(fieldNames, additionalValues = {}) {
  let defaultParams = defaultPublicParams(fieldNames);
  let swaggerObject = {
    swagger: {
      params: _.merge(defaultParams, additionalValues)
    }
  }
  return swaggerObject;
}

function defaultProtectedParams(fieldNames, username = null) {
  return {
    auth_payload: {
      scopes: ['sysadmin', 'public'],
      // This value in the real world is pulled from the keycloak user. It will look something like
      // idir/someusername
      preferred_username: username
    },
    fields: {
      value: _.cloneDeep(fieldNames)
    }
  };
}

function defaultPublicParams(fieldNames) {
  return {
    fields: {
      value: _.cloneDeep(fieldNames)
    }
  };
}

function buildParams(nameValueMapping) {
  let paramObj = {}
  _.mapKeys(nameValueMapping, function(value, key) {
    paramObj[key] = { value: value };
  });
  return paramObj;
}

async function mongooseConnect() {
  if (!(mongoose.connection && mongoose.connection.db)) {
    let genSettings = await dataGenerationSettings;
    if (genSettings.save_to_persistent_mongo) {
      mongoUri = "mongodb://localhost/epic";
    } else {
      if (mongoServer) {
        mongoUri = await mongoServer.getConnectionString()
      };
    }
    checkMongoUri();
    await mongoose.connect(mongoUri, mongooseOpts, (err) => {
      if (err) console.error(err);
    });
    console.log(mongoUri);
  }
};

async function checkMigrations(callback) {
  checkMongoUri();
  MongoClient.connect(mongoUri, function(err, db) {
    if (err) console.error(err);
    var dbo = db.db("epic");
    dbo.collection("migrations").countDocuments({}, function(err, numOfDocs){
      if (err) console.error(err);
      db.close();
      callback(numOfDocs);
    });
  });
}

async function runMigrations(migrationCount) {
  if (0 < migrationCount) return;
  checkMongoUri();
  await exec("./node_modules/db-migrate/bin/db-migrate up", function(err, stdout, stderr) {
    if (err) console.error(err);
  });
}

function instantiateInMemoryMongoServer() {
  return new mongoDbMemoryServer.default({
    instance: {}
    // , binary: {
    //   version: '3.6.3' // Use latest so that we hit warm node_module caches.  FTY prod is 3.6.3.  mongod --version
    // }
  });
}

exports.defaultNumberOfProjects = defaultNumberOfProjects;
exports.dataGenerationSettings = dataGenerationSettings;
exports.createSwaggerParams = createSwaggerParams;
exports.createPublicSwaggerParams = createPublicSwaggerParams;
exports.buildParams = buildParams;
exports.app = app;