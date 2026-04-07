'use strict';

/**
 * swagger-security.js
 *
 * Replaces swagger-tools' swaggerSecurity middleware.
 *
 * Used as a per-route factory inside swagger-router.js.
 * Must run AFTER buildParamsMiddleware has populated req.swagger.
 *
 * For operations with Bearer security: delegates to auth.verifyToken.
 * For public operations: sets a public auth_payload and passes through.
 */

const auth = require('../helpers/auth');

/**
 * Returns a middleware that enforces the security policy for `operation`.
 * @param {object} operation - Swagger operation object
 * @returns {function} Express middleware
 */
module.exports = function buildSecurityMiddleware(operation) {
  const requiresAuth = Array.isArray(operation.security) && operation.security.length > 0;

  return function securityCheck(req, res, next) {
    if (!requiresAuth) {
      req.swagger.params.auth_payload = {
        realm_access: { roles: ['public'] },
        preferred_username: 'public'
      };
      return next();
    }

    const token = req.headers.authorization || '';
    auth.verifyToken(req, null, token, (err) => {
      if (err) return; // auth.verifyToken already sent 403 via res
      next();
    });
  };
};
