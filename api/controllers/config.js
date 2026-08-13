var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');

// The keys this endpoint will serve, and the only ones. The schema already drops undeclared
// fields on write; this is the second half of the same guard, on read — so a key added to the
// collection out of band still cannot reach the public payload without a code change.
var PUBLIC_KEYS = [
  'ENVIRONMENT',
  'BANNER_COLOUR',
  'LOG_LEVEL',
  'API_PATH',
  'SEARCH_API_PATH',
  'ADMIN_PATH',
  'KEYCLOAK_URL',
  'KEYCLOAK_REALM',
  'KEYCLOAK_ENABLED',
  'ANALYTICS_API_URL',
  'ANALYTICS_DEBUG',
  'ANALYTICS_ENHANCED_TRACKING',
  'ANALYTICS_TRAFFIC_TRACKING',
  'SURVEY_URL',
  'SHOW_SURVEY_BANNER'
];

/**
 * Runtime configuration for the frontends.
 *
 * UNAUTHENTICATED — the swagger path carries no `security` block, which is what makes it public
 * (see api/middleware/swagger-security.js). Everything returned here is world-readable. Never add
 * a secret, key, or connection string to the Config model.
 *
 * Replaces the rproxy ConfigMap that answered this path before. Note that nginx's
 * `location = /api/config` is an exact match and beats the /api proxy, so this controller is
 * unreachable through rproxy until that block is removed from eao-nginx.
 */
exports.publicGet = async function (args, res) {
  try {
    var Config = mongoose.model('Config');
    // Not `.lean()`: hydrating the document applies the schema defaults to any path the stored
    // document is missing, so a key added to the model later answers with its declared default
    // instead of vanishing from the payload until someone backfills it.
    var doc = await Config.findOne({ _schemaName: 'Config' });

    if (!doc) {
      defaultLog.error('GET /api/config: no Config document — has the seed migration run?');
      return Actions.sendResponse(res, 404, { message: 'Configuration not found' });
    }

    var payload = {};
    PUBLIC_KEYS.forEach(function (key) {
      if (doc[key] !== undefined) {
        payload[key] = doc[key];
      }
    });

    return Actions.sendResponse(res, 200, payload);
  } catch (err) {
    defaultLog.error('GET /api/config failed:', err);
    return Actions.sendResponse(res, 500, { message: 'Could not read configuration' });
  }
};
