'use strict';

/**
 * Shared configuration helpers for the typesense-sync service.
 *
 * Centralises MongoDB URI construction so full-sync.js and index.js
 * stay in sync on connection options.
 */

/**
 * Build a MongoDB connection URI from environment variables.
 *
 * Environment variables:
 *   MONGODB_USERNAME    - MongoDB username
 *   MONGODB_PASSWORD    - MongoDB password
 *   MONGODB_DATABASE    - Database name (default: epic)
 *   MONGODB_HOST        - Hostname (default: localhost)
 *   MONGODB_PORT        - Port (default: 27017)
 *   MONGODB_AUTHSOURCE  - Auth source database (default: admin)
 *   MONGODB_DIRECT      - Set to "true" to use directConnection instead of replicaSet
 *                         (needed when port-forwarding from outside the cluster)
 */
function buildMongoUri() {
  const user = encodeURIComponent(process.env.MONGODB_USERNAME || '');
  const pass = encodeURIComponent(process.env.MONGODB_PASSWORD || '');
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const db   = process.env.MONGODB_DATABASE || 'epic';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';
  const replication = process.env.MONGODB_DIRECT === 'true'
    ? 'directConnection=true'
    : 'replicaSet=rs0';

  if (user && pass) {
    return `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=${auth}&${replication}`;
  }
  return `mongodb://${host}:${port}/${db}?${replication}`;
}

module.exports = { buildMongoUri };
