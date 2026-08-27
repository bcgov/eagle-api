'use strict';

const defaultLog = require('winston').loggers.get('default');
const Actions = require('../helpers/actions');
const { safeEqual } = require('../helpers/auth');

/**
 * Access curtain for non-production environments. Replaces the nginx basic auth that used to sit
 * in front of dev/test. The password is only ever compared here, so it never ships in the bundle.
 *
 * UNAUTHENTICATED — the swagger path carries no `security` block, and the global /api rate limiter
 * in app.js is what bounds guessing.
 */
exports.publicPost = async function (req, res) {
  const expected = process.env.ACCESS_GATE_PASSWORD;

  // No password configured means no gate. 404 rather than 401 so the route's existence is not
  // advertised on environments that do not use it.
  if (!expected) {
    return Actions.sendResponse(res, 404, { message: 'Not Found' });
  }

  const supplied = req.body && req.body.password;
  if (typeof supplied === 'string' && safeEqual(supplied, expected)) {
    return res.status(204).end();
  }

  defaultLog.warn('POST /api/public/gate: rejected access attempt from %s', req.ip);
  return Actions.sendResponse(res, 401, { error: 'Invalid password' });
};
