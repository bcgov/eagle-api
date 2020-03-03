var mongoose      = require("mongoose");
var _             = require('lodash');
var winston       = require('winston');


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
    require('./api/helpers/models/notificationProject');
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
  var options = require('./config/mongoose_options').mongooseOptions;
  if (!_.isEmpty(credentials)) {
    options.user = credentials.db_username;
    options.pass = credentials.db_password;
  }
  mongoose.Promise  = global.Promise;
  await loadModels(dbConnection, options, defaultLog);
}

exports.loadMongoose = loadMongoose;
exports.loadModels = loadModels;
exports.dbName = dbName;
exports.dbConnection = dbConnection;
exports.credentials = credentials;
exports.defaultLog = defaultLog;
