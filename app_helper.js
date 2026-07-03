const mongoose      = require('mongoose');
const winston       = require('winston');
const options       = require('./config/mongoose_options').mongooseOptions;

// Logging middleware
const { format, transports } = winston;
const logLevel = process.env.LOG_LEVEL || 'info';
winston.loggers.add('default', {
  transports: [
    new transports.File({
      level: logLevel,
      filename: '/tmp/epic-app.log',
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: format.combine(
        format.errors({ stack: true }),
        format.splat(),
        format.label({ label: 'default' }),
        format.timestamp(),
        format.json()
      )
    }),
    new transports.Console({
      level: logLevel,
      handleExceptions: true,
      format: format.combine(
        format.errors({ stack: true }),
        format.splat(),
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, stack }) =>
          stack
            ? `${timestamp} ${level}: ${message}\n${stack}`
            : `${timestamp} ${level}: ${message}`
        )
      )
    })
  ]
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

// Register all Mongoose models unconditionally at require time.
// Mongoose allows schema registration before a connection exists — models are
// bound to the default connection and become usable once connect() resolves.
// Registering outside the connect callback means models are always available
// even if the initial connect attempt is retried or delayed.
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

async function loadModels(dbConnection, options, logger) {
  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(logger, `Connecting to MongoDB (attempt ${attempt}/${MAX_RETRIES}): ${dbConnection}`);
      await mongoose.connect(dbConnection, options);
      log(logger, 'Database connected');
      return; // success
    } catch (err) {
      log(logger, `MongoDB connect error (attempt ${attempt}): ${err.message}`);
      if (attempt === MAX_RETRIES) {
        log(logger, 'All MongoDB connect attempts exhausted. Exiting so Kubernetes can restart.');
        process.exit(1);
      }
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 30000);
      log(logger, `Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function log(logger, msg) {
  if (logger && typeof logger.info === 'function') {
    logger.info(msg);
  } else {
    console.log(msg);
  }
}

async function loadMongoose() {
  if (credentials && (credentials.db_username || credentials.db_password)) {
    options.user = credentials.db_username;
    options.pass = credentials.db_password;
  }
  await loadModels(dbConnection, options, defaultLog);
}

exports.loadMongoose = loadMongoose;
exports.loadModels = loadModels;
exports.dbName = dbName;
exports.dbConnection = dbConnection;
exports.credentials = credentials;
exports.defaultLog = defaultLog;
