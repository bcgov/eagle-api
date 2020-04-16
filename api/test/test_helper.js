const express = require('express');
const bodyParser = require('body-parser');
const DatabaseCleaner = require('database-cleaner');
const dbCleaner = new DatabaseCleaner('mongodb');
const mongoose = require('mongoose');
const mongooseOpts = require('../../config/mongoose_options').mongooseOptions;
const app_helper = require('../../app_helper');
const mongoDbMemoryServer = require('mongodb-memory-server');
const MongoClient = require('mongodb').MongoClient;
const exec = require('child_process').exec;
const _ = require('lodash');
const fs = require('fs');
const fh = require('./factories/factory_helper');
const projectGenerationTime = 5 * 1000;
const prerequisiteGenerationTime = 30 * 1000;
const app = express();
let defaultLog = app_helper.defaultLog;
const defaultNumberOfProjects = 1;
let performMigrations = false;  // migrations used to be necessary to load the lists but we now load them directly via the list factory
let mongoServer;
let mongoUri = "";  // not initializing to localhost here on purpose - would rather error out than corrupt a persistent db
mongoose.Promise = global.Promise;
setupAppServer();

let jestTimeout = 10 * 1000;

jest.setTimeout(jestTimeout);

beforeAll(async () => {
  let genSettings = await dataGenerationSettings;
  if (2 < genSettings.projects) {
    jestTimeout = jestTimeout + (genSettings.projects * projectGenerationTime);
    jest.setTimeout(jestTimeout);
  }
  if (!genSettings.save_to_persistent_mongo) mongoServer = instantiateInMemoryMongoServer();
  await mongooseConnect();
  if ((performMigrations) && (genSettings.generate) && (genSettings.save_to_persistent_mongo)) await checkMigrations(runMigrations);
  if (!fs.existsSync(fh.generatedDocSamples.L)) {
    // eslint-disable-next-line require-atomic-updates
    jestTimeout = jestTimeout + prerequisiteGenerationTime;
    jest.setTimeout(jestTimeout);
    await fh.generatePrerequisitePdfs();
  }
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
  if ('' == mongoUri) throw 'Mongo URI is not set';
}

function getDataGenerationSettings() {
  let filepath = '/tmp/generate.config';
  if (fs.existsSync(filepath)){
    return new Promise(resolve => {
      let fileContents = '';
      fs.readFileSync(filepath).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; });
      let settingsObj = JSON.parse(fileContents);
      settingsObj.projects = Number(settingsObj.projects);
      settingsObj.save_to_persistent_mongo = ('Saved' == settingsObj.data_mode);
      settingsObj.generate_consistent_data = ('Static' == settingsObj.seed_mode);
      settingsObj.single_db_pass = ('Single' == settingsObj.db_passes);
      settingsObj.generate = ('true' == settingsObj.generate);
      resolve(settingsObj);
    });
  } else {
    return new Promise(resolve => {
      let data_mode = _.isEmpty(process.env.GENERATE_DATA_MODE) ? 'Unsaved' : process.env.GENERATE_DATA_MODE;
      let seed_mode = _.isEmpty(process.env.GENERATE_SEED_MODE) ? 'Static' : process.env.GENERATE_SEED_MODE;
      let db_passes = _.isEmpty(process.env.GENERATE_DB_PASSES) ? 'Single' : process.env.GENERATE_DB_PASSES;
      let settingsObj = {
        data_mode: data_mode,
        seed_mode: seed_mode,
        projects: _.isEmpty(process.env.GENERATE_NUM_OF_PROJECTS) ? defaultNumberOfProjects : Number(process.env.GENERATE_NUM_OF_PROJECTS),
        save_to_persistent_mongo: ('Saved' == data_mode),
        generate_consistent_data: ('Static' == seed_mode),
        single_db_pass: ('Single' == db_passes),
        generate: _.isEmpty(process.env.GENERATE_ON) ? false : ('true' == process.env.GENERATE_ON)
      };
      resolve(settingsObj);
    });
  }
}

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
  };
  return swaggerObject;
}

function createPublicSwaggerParams(fieldNames, additionalValues = {}) {
  let defaultParams = defaultPublicParams(fieldNames);
  let swaggerObject = {
    swagger: {
      params: _.merge(defaultParams, additionalValues)
    }
  };
  return swaggerObject;
}

function defaultProtectedParams(fieldNames, username = null) {
  return {
    auth_payload: {
      scopes: ['sysadmin', 'public'],
      // This value in the real world is pulled from the keycloak user. It will look something like
      // idir/someusername
      preferred_username: username,
      realm_access: {
        roles: [
          'project-proponent',
          'project-system-admin',
          'offline_access',
          'uma_authorization',
          'inspector',
          'sysadmin'
        ]
      },
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

function createSwaggerBodyObj(paramName, bodyObj) {
  return {
    [paramName]: {
      value: bodyObj
    }
  };
}

function buildParams(nameValueMapping) {
  let paramObj = {};
  _.mapKeys(nameValueMapping, function(value, key) {
    paramObj[key] = { value: value };
  });
  return paramObj;
}

async function mongooseConnect() {
  if (!(mongoose.connection && mongoose.connection.db)) {
    let genSettings = await dataGenerationSettings;
    if (genSettings.save_to_persistent_mongo) {
      mongoUri = app_helper.dbConnection;
      if (!_.isEmpty(app_helper.credentials)) {
        mongooseOpts.user = app_helper.credentials.db_username;
        mongooseOpts.pass = app_helper.credentials.db_password;
      }
    } else {
      if (mongoServer) {
        mongoUri = await mongoServer.getConnectionString();
      }
    }
    checkMongoUri();
    await mongoose.connect(mongoUri, mongooseOpts, (err) => {
      if (err) defaultLog.error(err);
    });
    defaultLog.info(mongoUri);
  }
}

// we only wish to run migrations on databases which have never run migrations before
async function checkMigrations(callback) {
  checkMongoUri();
  let options;
  if ((!_.isEmpty(app_helper.credentials))
  && (!_.isEmpty(app_helper.credentials.db_username))
  && (!_.isEmpty(app_helper.credentials.db_password))) {
    options = {};
    let auth = {};
    auth.user = app_helper.credentials.db_username;
    auth.password = app_helper.credentials.db_password;
    options.auth = auth;
  }
  MongoClient.connect(mongoUri, options, function(err, db) {
    if (err) defaultLog.error(err);
    var dbo = db.db(app_helper.dbName);
    const runMigrations = 0;
    const migrationsCollectionName = 'migrations';
    let mcn = migrationsCollectionName;
    dbo.listCollections({name: mcn}).toArray(function(err, collInfos) {
      if (0 == collInfos.length) {
        dbo.createCollection(mcn, function(err) {
          if (err) if (0 == err.message.includes('Cannot use a session that has ended')) defaultLog.error(err);
          defaultLog.verbose(mcn + ' collection created');
          db.close();
          callback(runMigrations);
        });
        return;
      }
    });
    dbo.collection(mcn).countDocuments({}, function(err, numOfDocs){
      if (err) defaultLog.error(err);
      db.close();
      callback(numOfDocs);
    });
  });
}

async function runMigrations(migrationCount) {
  let genSettings = await dataGenerationSettings;
  if (!genSettings.save_to_persistent_mongo) return;
  checkMongoUri();
  if (-1 == mongoUri.indexOf('localhost')) return;  // TODO make this work in both memory-server instances and on deployments via database.json
  if (0 < migrationCount) return;
  await exec('./node_modules/db-migrate/bin/db-migrate up', function(err) {
    if (err) defaultLog.error(err);
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
exports.createSwaggerBodyObj = createSwaggerBodyObj;
exports.buildParams = buildParams;
exports.app = app;