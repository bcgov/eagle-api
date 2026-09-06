'use strict';

/**
 * Mongo connection string for the standalone entry points (run_migration.js, scripts/). The app
 * itself builds its own in app_helper.js, where mongoose takes the credentials separately.
 */
function buildMongoUri() {
  const host = process.env.MONGODB_SERVICE_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || 27017;
  const db   = process.env.MONGODB_DATABASE || 'epic';
  const user = process.env.MONGODB_USERNAME || '';
  const pass = process.env.MONGODB_PASSWORD || '';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';

  if (user && pass) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}?authSource=${auth}`;
  }
  return `mongodb://${host}:${port}/${db}`;
}

module.exports = { buildMongoUri };
