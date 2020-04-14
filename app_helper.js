const mongoose      = require('mongoose');
const cron          = require('node-cron');
const _             = require('lodash');
const winston       = require('winston');
const options       = require('./config/mongoose_options').mongooseOptions;
const minDate       = new Date('1970-01-01T00:00:00Z');

// Logging middleware
winston.loggers.add('default', {
  file: {
    level: 'info',
    filename: `/tmp/epic-app.log`,
    handleExceptions: true,
    json: true,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    label: 'default',
  },
  console: {
    colorize: 'true',
    handleExceptions: true,
    json: false,
    level: 'info',
    label: 'default',
  }
});
var defaultLog = winston.loggers.get('default');

var dbName = (process.env.MONGODB_DATABASE || 'epic');
var dbConnection  = 'mongodb://'
                    + (process.env.MONGODB_SERVICE_HOST || process.env.DB_1_PORT_27017_TCP_ADDR || 'localhost')
                    + '/'
                    + dbName;
var db_username = process.env.MONGODB_USERNAME || '';
var db_password = process.env.MONGODB_PASSWORD || '';
var credentials = {
  db_username : db_username,
  db_password : db_password
};

async function loadModels(dbConnection, options, logger) {
  log(logger, 'Connecting to:' + dbConnection);
  await mongoose.connect(dbConnection, options).then(() => {
    log(logger, 'Database connected');
    log(logger, 'loading db models');
    require('./api/helpers/models/audit');
    require('./api/helpers/models/list');
    require('./api/helpers/models/user');
    require('./api/helpers/models/group');
    require('./api/helpers/models/pin');
    require('./api/helpers/models/organization');
    require('./api/helpers/models/vc');
    require('./api/helpers/models/inspectionItem');
    require('./api/helpers/models/inspection');
    require('./api/helpers/models/inspectionElement');
    require('./api/helpers/models/project');
    require('./api/helpers/models/recentActivity');
    require('./api/helpers/models/document');
    require('./api/helpers/models/comment');
    require('./api/helpers/models/commentperiod');
    require('./api/helpers/models/topic');
    require('./api/helpers/models/projectNotification');
    require('./api/helpers/models/cacUser');
    log(logger, 'db model loading done.');
  },
  err => {
    log(logger, 'err:' + err);
    return;
  });
}

function log(logger, msg) {
  if (!_.isEmpty(logger)) {
    logger.info(msg);
  } else {
    console.log(msg);
  }
}

async function loadMongoose() {
  if (!_.isEmpty(credentials)) {
    options.user = credentials.db_username;
    options.pass = credentials.db_password;
  }
  mongoose.Promise  = global.Promise;
  await loadModels(dbConnection, options, defaultLog);
}

async function update__read_only__reports__top_search_terms(defaultLog, afterTimestamp) {
  let queryAggregates = [
    {$project:{
      "meta":"$meta",
      "action":"$action",
      "timestamp":"$timestamp"
    }},
    {$match:{
      $and:[
        {$or:[
          {"action":{$eq:"search"}},
          {"action":{$eq:"Search"}}]},
        {"timestamp":{$gt: new Date(afterTimestamp) }}
      ]
    }},
    {$project:{
      "_id":"$_id",
      "___group":{"meta":"$meta"},
      "timestamp":"$timestamp"
    }},
    {$group:{
      "_id":"$___group",
      "count":{$sum:1},
      "latest":{$max:"$timestamp"}
    }},
    {$project:{
      "_id": {$ifNull: ["$_id.meta", "\\nnull\\n"]},
      "count": true,
      "latest": true
    }}
  ];
  if (minDate != afterTimestamp) {
    defaultLog.debug('checking if need to update read_only__reports__top_search_terms');
    let latestSinceLastRun = await mongoose.model('Audit').aggregate(queryAggregates);
    latestSinceLastRun.map((recentlyUpdated) => {
      const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
      collection.updateOne({
        "_id":recentlyUpdated['_id'],
        "latest":{"$ne": recentlyUpdated['latest']}
      },
      { $inc: {
        "count": recentlyUpdated['count']}
      });
      collection.updateOne({
        "_id":recentlyUpdated['_id'],
        "latest":{"$ne": recentlyUpdated['latest']}
      },
      { $set: {
        "latest": recentlyUpdated['latest']}
      });
      defaultLog.debug('updated "' + recentlyUpdated['_id'] + '" to \'' + recentlyUpdated['latest'] + '\' and incremented count by ' + recentlyUpdated['count'] +']');
    });
  } else {
    defaultLog.debug('initializing read_only__reports__top_search_terms');
    queryAggregates.push({ $merge: { into: "read_only__reports__top_search_terms", whenMatched: "replace" } });
    await mongoose.model('Audit').aggregate(queryAggregates);
    const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
    collection.createIndex({latest: 1});
  }
}

async function get_last_update__top_search_terms(defaultLog) {
  const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
  if (!collection) return minDate;
  let result = await collection.find({}, {"_id":0, "latest":1}).sort({"latest":-1}).limit(1).toArray();
  if (0 == result.length) return minDate;
  defaultLog.debug('last update to search terms was: ' + new Date(result[0].latest));
  return new Date(result[0].latest);
}

async function startCron(defaultLog) {
  // standard crom pattern
  // seconds[0-59] minutes[0-59] hours[0-23] day_of_month[1-31] months[0-11] day_of_week[0-6]
  // cron.schedule('* 3 * * * *', async function() {
  cron.schedule('10 * * * * *', async function() {
    let afterTimestamp = await get_last_update__top_search_terms(defaultLog);
    await update__read_only__reports__top_search_terms(defaultLog, afterTimestamp);
  });
}

exports.loadMongoose = loadMongoose;
exports.startCron = startCron;
exports.loadModels = loadModels;
exports.dbName = dbName;
exports.dbConnection = dbConnection;
exports.credentials = credentials;
exports.defaultLog = defaultLog;
