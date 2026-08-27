// Runtime configuration for the frontends, served unauthenticated by GET /api/config.
//
// One document. It replaces the nginx ConfigMap that rproxy used to serve from
// `conf.d/server.conf.tmpl` — same keys, same values, but editable without a Helm deploy.
//
// EVERY KEY IS DECLARED HERE ON PURPOSE. Mongoose drops fields that are not in the schema, and
// that is the guard that stops an operator pasting a secret into this collection and having it
// served to the public. Adding a key here publishes it; there is no other gate.
//
// THE DEFAULTS BELOW ARE SERVED, NOT FALLBACKS. The controller hydrates rather than using .lean(),
// so a key the stored document lacks answers with its default here — and the frontends merge this
// payload OVER env.js (server wins). A default is therefore a published value that overwrites
// whatever the build baked in. Choosing a careless one silently clobbers a bootstrap value.
//
// No `read`/`write` arrays, unlike the other models: this endpoint has no ACL and applies no
// $redact. Carrying permission fields nothing enforces would imply a gate that does not exist.
//
// Deliberately absent, and each for its own reason:
//   API_LOCATION       - the frontend bootstraps from it, so a value served here would fight the
//                        one baked into env.js at build time.
//   KEYCLOAK_CLIENT_ID - eagle-admin overrides it from env.js anyway (its config.service.ts
//                        preserves the local value), and eagle-public has no Keycloak at all.
//   ENGAGE_API_URL     - zero consumers in either frontend.
module.exports = require('../models')('Config', {
  ENVIRONMENT                 : { type: String, default: null },
  BANNER_COLOUR               : { type: String, default: null },
  LOG_LEVEL                   : { type: Number, default: 0 },

  API_PATH                    : { type: String, default: '/api' },
  // Empty means "use eagle-api", and that is the kill switch — eagle-public's getSearchApiPath()
  // falls back to getApiPath() when this is blank, reverting search with no redeploy.
  SEARCH_API_PATH             : { type: String, default: '' },
  ADMIN_PATH                  : { type: String, default: '/admin/' },
  // No default: absent unless a row sets it true. Gates eagle-public's Document Content tab.
  CONTENT_SEARCH              : { type: Boolean },

  KEYCLOAK_URL                : { type: String, default: null },
  KEYCLOAK_REALM              : { type: String, default: null },
  KEYCLOAK_ENABLED            : { type: Boolean, default: true },

  ANALYTICS_API_URL           : { type: String, default: '/analytics' },
  ANALYTICS_DEBUG             : { type: Boolean, default: false },
  ANALYTICS_ENHANCED_TRACKING : { type: Boolean, default: true },
  ANALYTICS_TRAFFIC_TRACKING  : { type: Boolean, default: true },

  SURVEY_URL                  : { type: String, default: null },
  SHOW_SURVEY_BANNER          : { type: Boolean, default: false },

  // Tells the frontends to show the access curtain. The password itself is never served here —
  // POST /api/public/gate checks it server-side.
  ACCESS_GATE                 : { type: Boolean, default: false }
}, 'epic');
