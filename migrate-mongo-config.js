// migrate-mongo configuration
// https://github.com/seppevs/migrate-mongo

'use strict';

const buildMongoUri = () => {
  const host = process.env.MONGODB_SERVICE_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || 27017;
  const db   = process.env.MONGODB_DATABASE || 'epic';
  // Use the same env vars as app_helper.js so migrations can run on the API pod.
  const user = process.env.MONGODB_USERNAME || '';
  const pass = process.env.MONGODB_PASSWORD || '';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';

  if (user && pass) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}?authSource=${auth}`;
  }
  return `mongodb://${host}:${port}/${db}`;
};

module.exports = {
  mongodb: {
    url: buildMongoUri(),
    options: {}
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs'
};
