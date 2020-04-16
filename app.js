'use strict';

var app           = require('express')();
var fs            = require('fs');
var uploadDir     = process.env.UPLOAD_DIRECTORY || './uploads/';
var hostname      = process.env.API_HOSTNAME || 'localhost:3000';
var swaggerTools  = require('swagger-tools');
var YAML          = require('yamljs');
var auth          = require('./api/helpers/auth');
var swaggerConfig = YAML.load('./api/swagger/swagger.yaml');
var bodyParser    = require('body-parser');
var app_helper    = require('./app_helper');

var api_default_port = 3000;

var express_server;

var defaultLog = app_helper.defaultLog;

// Increase postbody sizing
app.use(bodyParser.json({limit: '10mb', extended: true}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: true}));

// Enable CORS
app.use(function (req, res, next) {
  defaultLog.info(req.method, req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,responseType');
  res.setHeader('Access-Control-Expose-Headers', 'x-total-count,x-pending-comment-count,x-next-comment-id');
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Cache-Control', 'max-age=4');
  next();
});

// Dynamically set the hostname based on what environment we're in.
swaggerConfig.host = hostname;

// Swagger UI needs to be told that we only serve https in Openshift
if (hostname !== 'localhost:3000') {
  swaggerConfig.schemes = ['https'];
}

swaggerTools.initializeMiddleware(swaggerConfig, function(middleware) {
  app.use(middleware.swaggerMetadata());

  // TODO: Fix this
  // app.use(middleware.swaggerValidator({ validateResponse: false}));

  app.use(
    middleware.swaggerSecurity({
      Bearer: auth.verifyToken
    })
  );

  var routerConfig = {
    controllers: './api/controllers',
    useStubs: false
  };

  app.use(middleware.swaggerRouter(routerConfig));

  app.use(middleware.swaggerUi({apiDocs: '/api/docs', swaggerUi: '/api/docs'}));

  // Make sure uploads directory exists
  try {
    if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir);
    }
  } catch (e) {
    // Fall through - uploads will continue to fail until this is resolved locally.
    defaultLog.info('Couldn\'t create upload folder:', e);
  }
  app_helper.loadMongoose().then(() => {
    app_helper.startCron(defaultLog).then(() => {
      express_server = app.listen(api_default_port, '0.0.0.0', function() {
        defaultLog.info('Started server on port ' + api_default_port);
      });
    });
  }).catch(function (err) {
    defaultLog.info('err:', err);
  });
});

function shutdown() {
  if (express_server) {
    console.log('Shutting down gracefully');
    express_server.close(() => {
      console.log('Closed out remaining connections');
      process.exit(0);
    });
  }
}

exports.shutdown = shutdown;
exports.api_default_port = api_default_port;
exports.dbConnection = app_helper.dbConnection;
