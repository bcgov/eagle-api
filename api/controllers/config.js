var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
const crypto = require('crypto');
const demiPush = require('../helpers/demiPush');

// Hash of the payload this pod last mirrored to DEMI: the push fires once per boot, then only
// when the served value changes.
let lastPushedHash = null;

// Sorted keys, or the digest moves with insertion order and every request pushes. The payload is
// flat, so an array replacer is enough to fix the order.
function payloadHash(payload) {
  return crypto.createHash('sha1').update(JSON.stringify(payload, Object.keys(payload).sort())).digest('hex');
}

// The keys this endpoint will serve, and the only ones. The schema already drops undeclared
// fields on write; this is the second half of the same guard, on read — so a key added to the
// collection out of band still cannot reach the public payload without a code change.
var PUBLIC_KEYS = [
  'ENVIRONMENT',
  'BANNER_COLOUR',
  'LOG_LEVEL',
  'API_PATH',
  'SEARCH_API_PATH',
  'DEMI_PROJECTS_PATH',
  'ADMIN_PATH',
  'CONTENT_SEARCH',
  'KEYCLOAK_URL',
  'KEYCLOAK_REALM',
  'KEYCLOAK_ENABLED',
  'EAGLE_ANALYTICS_URL',
  'APPINSIGHTS_CONNECTION_STRING',
  'SURVEY_URL',
  'SHOW_SURVEY_BANNER',
  'ACCESS_GATE'
];

/**
 * Runtime configuration for the frontends.
 *
 * UNAUTHENTICATED — the swagger path carries no `security` block, which is what makes it public
 * (see api/middleware/swagger-security.js). Everything returned here is world-readable. Never add
 * a secret, key, or connection string to the Config model. Sole exception: APPINSIGHTS_CONNECTION_STRING —
 * an ingestion connection string, public by design (ships in the SPA bundle), bounded by the workspace daily cap.
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
      // app.js stamps max-age=60 on every unauthenticated GET before routing. A good config
      // should be cacheable; a failure must not be, or a brief outage sticks in rproxy and in
      // every browser for a minute after the database comes back.
      res.setHeader('Cache-Control', 'no-store');
      return Actions.sendResponse(res, 404, { message: 'Configuration not found' });
    }

    var payload = {};
    PUBLIC_KEYS.forEach(function (key) {
      if (doc[key] !== undefined) {
        payload[key] = doc[key];
      }
    });

    // Retirement shim, not a config key: both frontends merge this payload over env.js with a
    // shallow spread, and env.js bakes ANALYTICS_API_URL: '/analytics'. Omitting it would turn the
    // retired penguin client back on in every deployed browser. Constant, so Mongo cannot set it.
    // Remove once the eagle-public Angular line (v2.7.x) is retired at v3.0.0.
    payload.ANALYTICS_API_URL = '';

    // The mirror push lives on the read path because Config has no write controller — hand edits
    // in Mongo are the only writes, so the served payload is the only place a change surfaces.
    const hash = payloadHash(payload);
    if (hash !== lastPushedHash) {
      lastPushedHash = hash;
      demiPush.config(payload);
    }

    return Actions.sendResponse(res, 200, payload);
  } catch (err) {
    defaultLog.error('GET /api/config failed:', err);
    res.setHeader('Cache-Control', 'no-store');
    return Actions.sendResponse(res, 500, { message: 'Could not read configuration' });
  }
};
