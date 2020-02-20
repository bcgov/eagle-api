var mongoose      = require("mongoose");
var _             = require('lodash');

async function loadModels(dbConnection, options, logger) {
    log(logger, "Connecting to:" + dbConnection);
    await mongoose.connect(dbConnection, options).then(() => {
        log(logger, "Database connected");
        log(logger, "loading db models");
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
        require('./api/helpers/models/cacUser');
        log(logger, "db model loading done.");
      },
      err => {
        log(logger, "err:" + err);
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
  
  async function loadMongoose(dbConnection, credentials, logger) {
    var options = require('./config/mongoose_options').mongooseOptions;
    if (!_.isEmpty(credentials)) {
      options.user = credentials.db_username;
      options.pass = credentials.db_password;
    }
    mongoose.Promise  = global.Promise;
    await loadModels(dbConnection, options, logger);
  }

exports.loadMongoose = loadMongoose;
exports.loadModels = loadModels;
