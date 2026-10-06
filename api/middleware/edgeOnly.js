'use strict';

const defaultLog = require('winston').loggers.get('default');

// Raw Host header, not req.hostname: with `trust proxy` set, req.hostname reads X-Forwarded-Host,
// which the caller controls.
function requestHost(req) {
  return (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
}

/**
 * Refuses requests that reach the direct Route host without passing through Azure Front Door.
 * Off unless both EDGE_ONLY_HOST and FRONT_DOOR_ID are set. Other hosts (in-cluster callers,
 * the console Route) and /api/health pass untouched.
 */
module.exports = function edgeOnly(req, res, next) {
  const edgeHost = process.env.EDGE_ONLY_HOST;
  const frontDoorId = process.env.FRONT_DOOR_ID;
  if (!edgeHost || !frontDoorId || req.path === '/api/health') {
    return next();
  }

  const host = requestHost(req);
  if (host !== edgeHost.toLowerCase()) {
    return next();
  }

  // Required lazily so auth.js loads under the test env it expects, as in rateLimitKey.js.
  const { safeEqual } = require('../helpers/auth');
  if (safeEqual(req.get('X-Azure-FDID'), frontDoorId)) {
    return next();
  }

  defaultLog.warn('edgeOnly: refused request that skipped Front Door', { path: req.path, host });
  return res.status(403).json({ message: 'Forbidden' });
};
