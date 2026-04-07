'use strict';

require('dotenv').config();
var app              = require('express')();
var fs               = require('fs');
var path             = require('path');
var uploadDir        = process.env.UPLOAD_DIRECTORY || './uploads/';
var hostname         = process.env.API_HOSTNAME || 'localhost:3000';
var YAML             = require('js-yaml');
var swaggerUi        = require('swagger-ui-express');
var createRouter     = require('./api/middleware/swagger-router');
var swaggerSpec      = YAML.load(fs.readFileSync('./api/swagger/swagger.yaml', 'utf8'));
var bodyParser       = require('body-parser');
var app_helper       = require('./app_helper');

var api_default_port = 3000;

var express_server;

var defaultLog = app_helper.defaultLog;

// Increase postbody sizing
app.use(bodyParser.json({limit: '10mb', extended: true}));
app.use(bodyParser.urlencoded({limit: '10mb', extended: true}));

// disable powered by header
app.disable('x-powered-by');

// Enable CORS
// Reflect the requesting origin instead of '*' so that credentialed requests
// (those carrying an Authorization header) are accepted by all browsers.
app.use(function (req, res, next) {
  defaultLog.info(req.method, req.url);

  var origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,responseType');
  res.setHeader('Access-Control-Expose-Headers', 'x-total-count,x-pending-comment-count,x-next-comment-id');
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'max-age=4');
  // headers for zap scan issues
  res.setHeader('X-XSS-Protection', '1');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Health check — responds immediately without DB dependency.
// Used by CI smoke-test wait loop and OpenShift readiness probes.
app.get('/api/health', function (req, res) {
  res.status(200).json({ status: 'ok' });
});

// Analytics proxy — forwards /analytics/* to penguin-analytics service.
// In production, nginx routes /analytics directly. This route serves local dev
// where proxy.conf.js sends /analytics to eagle-api.
var axios = require('axios');
var analyticsTarget = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3001';
app.use('/analytics', function (req, res) {
  var targetUrl = analyticsTarget + '/analytics' + req.url;
  axios({
    method: req.method,
    url: targetUrl,
    data: req.body,
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000
  }).then(function (response) {
    res.status(response.status).json(response.data);
  }).catch(function (err) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({ error: 'Analytics service unavailable' });
    }
  });
});

// Swagger UI — serve the API docs at /api/docs
if (hostname !== 'localhost:3000') {
  swaggerSpec.schemes = ['https'];
}
swaggerSpec.host = hostname;
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Auto-wired API router — reads swagger.yaml and registers one Express route per
// operation, populates req.swagger.params, enforces Bearer auth, and calls the
// matching controller function.
var controllerDirs = [
  path.join(__dirname, 'api/controllers'),
  path.join(__dirname, 'api/tasks')
];
app.use('/api', createRouter(swaggerSpec, controllerDirs));

// Make sure uploads directory exists
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
} catch (e) {
  defaultLog.info('Couldn\'t create upload folder:', e);
}

// Skip MongoDB connection and server startup in test mode
// Tests handle their own database connection to in-memory MongoDB
if (process.env.NODE_ENV !== 'test') {
  app_helper.loadMongoose().then(() => {
    express_server = app.listen(api_default_port, '0.0.0.0', function() {
      defaultLog.info('Started server on port ' + api_default_port);
    });
  }).catch(function (err) {
    defaultLog.info('err:', err);
  });
}

// Counterintuitively, we crash because we don't want the pod hanging around. Let's just spin up
// a new pod incase the mongo topology was destroyed, among other things.
process.on('unhandledRejection', function(reason) {
  console.log("Unhandled Rejection:", reason);
  process.exit(1);
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

module.exports = app;
exports.shutdown = shutdown;
exports.api_default_port = api_default_port;
exports.dbConnection = app_helper.dbConnection;

