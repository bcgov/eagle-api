'use strict';

try {
  process.loadEnvFile();
} catch (err) {
  // Silent fallback: use system environment variables (e.g. in container environments)
}

var express          = require('express');
var app              = express();
var fs               = require('fs');
var path             = require('path');
var uploadDir        = process.env.UPLOAD_DIRECTORY || './uploads/';
var hostname         = process.env.API_HOSTNAME || 'localhost:3000';
var YAML             = require('js-yaml');
var swaggerUi        = require('swagger-ui-express');
var app_helper       = require('./app_helper');
var createRouter     = require('./api/middleware/swagger-router');
var swaggerSpec      = YAML.load(fs.readFileSync('./api/swagger/swagger.yaml', 'utf8'));
const rateLimit      = require('express-rate-limit');

var api_default_port = 3000;

var express_server;

var defaultLog = app_helper.defaultLog;

// Increase postbody sizing
// Accept both application/json and text/plain — Typesense SearchClient sends
// multi_search bodies as text/plain (to avoid CORS preflight), but the body
// content is always valid JSON.
app.use(express.json({ limit: '10mb', type: ['application/json', 'text/plain'] }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// disable powered by header
app.disable('x-powered-by');

// Trust one proxy hop (nginx) so req.ip reflects the real client IP, not nginx's
// address. Required for express-rate-limit to key on the correct remote IP.
app.set('trust proxy', 1);

// Enable CORS
// Reflect the requesting origin instead of '*' so that credentialed requests
// (those carrying an Authorization header) are accepted by all browsers.
app.use(function (req, res, next) {
  defaultLog.info(`${req.method} ${req.url}`);

  const origin = req.headers.origin || '';
  const corsAllowList = process.env.CORS_ALLOW_LIST
    ? process.env.CORS_ALLOW_LIST.split(',').map(o => o.trim())
    : [
        'http://localhost:4200',
        'http://localhost:4300',
        'http://localhost:8080',
        'https://eagle-dev.apps.silver.devops.gov.bc.ca',
        'https://eagle-test.apps.silver.devops.gov.bc.ca',
        'https://projects.eao.gov.bc.ca'
      ];

  if (corsAllowList.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,responseType');
  res.setHeader('Access-Control-Expose-Headers', 'x-total-count,x-pending-comment-count,x-next-comment-id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'GET') {
    // Authenticated requests must not be cached — admin users need fresh data
    // after mutations (delete, publish, etc.). Public GETs can cache briefly.
    if (req.headers.authorization) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'max-age=60');
    }
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
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
var analyticsTarget = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3001';
app.use('/analytics', function (req, res) {
  var targetUrl = analyticsTarget + '/analytics' + req.url;
  fetch(targetUrl, {
    method: req.method,
    body: req.body ? JSON.stringify(req.body) : undefined,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000)
  })
  .then(async function (response) {
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    res.status(response.status).json(data);
  })
  .catch(function (err) {
    if (err.name === 'TimeoutError') {
      res.status(504).json({ error: 'Analytics service timeout' });
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

// Rate limiters — applied before the auto-wired router so they run on all /api routes.
// Typesense search is limited tightly (CPU-heavy queries); general API has a generous burst.
// NOTE: health check at /api/health is registered above and responds before reaching
// these limiters, so health probes are not counted against the rate limit.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Search rate limit exceeded. Please try again later.' },
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) =>
    req.path.startsWith('/public/typesense') ||
    req.path.startsWith('/typesense'),
  message: { error: 'Too many requests. Please try again later.' },
});

// Disable Typesense middleware if TYPESENSE_ENABLED is false
app.use((req, res, next) => {
  if (
    (req.path.startsWith('/api/public/typesense') || req.path.startsWith('/api/typesense')) &&
    process.env.TYPESENSE_ENABLED === 'false'
  ) {
    return res.status(503).json({ error: 'Search is temporarily disabled.' });
  }
  next();
});

// More-specific paths first — Express applies the first matching middleware
app.use('/api/public/typesense', searchLimiter);
app.use('/api/typesense', searchLimiter);
app.use('/api', globalLimiter);

// Backward-compatible project redirects
const projectRedirectMiddleware = require('./api/middleware/projectRedirect');
app.use(projectRedirectMiddleware());

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
  app_helper.loadMongoose().then(async () => {
    // Start Agenda job queue after MongoDB is connected
    const { startJobQueue } = require('./api/helpers/jobQueue');
    await startJobQueue().catch(err => defaultLog.error('[jobQueue] Failed to start:', err.message));

    express_server = app.listen(api_default_port, '0.0.0.0', function() {
      defaultLog.info('Started server on port ' + api_default_port);
      // Run startup configuration checks for email helper
      try {
        require('./api/helpers/email').checkConfig();
      } catch (err) {
        defaultLog.error('Failed to run email config check:', err.message);
      }
    });
  }).catch(function (err) {
    // loadMongoose() already retried and exited on exhaustion, but catch any
    // unexpected rejection here too — crashing is better than serving 400s.
    defaultLog.error('Fatal: MongoDB connection failed:', err);
    process.exit(1);
  });
}

// Log unhandled rejections but let the process survive.
// Mongoose auto-reconnects on transient MongoDB errors (timeouts, topology
// changes).  Crashing here caused 90+ pod restarts per week in production.
process.on('unhandledRejection', function(reason) {
  defaultLog.error('Unhandled Rejection:', reason);
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

