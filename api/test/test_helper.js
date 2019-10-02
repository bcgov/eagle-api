const express = require('express');
const bodyParser = require('body-parser');
const DatabaseCleaner = require('database-cleaner');
const dbCleaner = new DatabaseCleaner('mongodb');
const mongoose = require('mongoose');
const mongooseOpts = require('../../config/mongoose_options').mongooseOptions;
const mongoDbMemoryServer = require('mongodb-memory-server');
const MongoClient = require('mongodb').MongoClient;
const exec = require('child_process').exec;
const _ = require('lodash');

const app = express();

let usePersistentMongoInstance = false;

let mongoServer;
let mongoUri = "";  // not initializing to localhost here on purpose - would rather error out than corrupt a persistent db
mongoose.Promise = global.Promise;
setupAppServer();

jest.setTimeout(10000);


beforeAll(async () => {
  if (!usePersistentMongoInstance)
    mongoServer = new mongoDbMemoryServer.default({
      instance: {},
      binary: {
        version: '3.2.21', // Mongo Version
      },
    });
  await mongooseConnect();
  //await checkMigrations(runMigrations);
});

beforeEach(async () => {
  await mongooseConnect();
});

afterEach(done => {
  if (mongoose.connection && mongoose.connection.db) {
    dbCleaner.clean(mongoose.connection.db, () => {
      done();
    });
  } else {
    done();
  }
});

afterAll(async () => {
  if (mongoose.connection) await mongoose.disconnect();
  await mongoServer.stop();
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
      // idir/arwhilla
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
    if (usePersistentMongoInstance) {
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
    if (err) throw err;
    var dbo = db.db("epic");
    dbo.collection("migrations").count({}, function(err, numOfDocs){
      if (err) throw err;
      db.close();
      callback(numOfDocs);
    });
  });
}

async function runMigrations(migrationCount) {
  if (0 < migrationCount) return;
  checkMongoUri();
  await exec("./node_modules/db-migrate/bin/db-migrate up", function(err, stdout, stderr) {
    if (err) throw err;
    console.log(stdout);
  });
}

exports.usePersistentMongoInstance = usePersistentMongoInstance;
exports.createSwaggerParams = createSwaggerParams;
exports.createPublicSwaggerParams = createPublicSwaggerParams;
exports.buildParams = buildParams;
exports.app = app;