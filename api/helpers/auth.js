'use strict';

var jwt             = require('jsonwebtoken');
const jwksClient    = require('jwks-rsa');

var ISSUER          = process.env.SSO_ISSUER || 'https://dev.loginproxy.gov.bc.ca/auth/realms/eao-epic';
var JWKSURI         = process.env.SSO_JWKSURI || 'https://dev.loginproxy.gov.bc.ca/auth/realms/eao-epic/protocol/openid-connect/certs';
var JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || '1440'; // 24 hours in minutes.
var SECRET          = process.env.SECRET || 'defaultSecret';
var KEYCLOAK_ENABLED = process.env.KEYCLOAK_ENABLED || 'true';
var winston         = require('winston');
var defaultLog      = winston.loggers.get('default');

// Module-level client so the signing-key cache persists across requests.
// Without this, a new client (and empty cache) is created on every auth call,
// causing a Keycloak JWKS fetch for every authenticated request.
const jwksClientInstance = jwksClient({
  strictSsl: true,
  jwksUri: JWKSURI,
  cache: true,
  cacheMaxAge: 86400000,     // Cache signing keys for 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 5   // Throttle Keycloak JWKS fetches
});

exports.verifyToken = function(req, authOrSecDef, token, callback) {
  // scopes/roles defined for the current endpoint
  var currentScopes = req.swagger.operation['x-security-scopes'];
  function sendError() {
    return req.res.status(403).json({ message: 'Error: Access Denied' });
  }

  // API key check — active when INTERNAL_API_KEY (or legacy SMOKE_API_KEY) env var is set.
  // Used by internal services (cron jobs) and smoke tests to authenticate without Keycloak.
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || process.env.SMOKE_API_KEY;
  if (INTERNAL_API_KEY) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const crypto = require('crypto');
      const keyBuf = Buffer.from(apiKey);
      const expectedBuf = Buffer.from(INTERNAL_API_KEY);
      if (keyBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(keyBuf, expectedBuf)) {
        req.swagger.params.auth_payload = {
          iss: ISSUER,
          preferred_username: 'internal-service',
          realm_access: { roles: ['project-admin-staff', 'project-team', 'public'] }
        };
        return callback(null);
      }
    }
  }

  // validate the 'Authorization' header. it should have the following format:
  //'Bearer tokenString'
  if (token && token.indexOf('Bearer ') == 0) {
    var tokenString = token.split(' ')[1];

    // If Keycloak is enabled, get the JWKSURI and process accordingly.  Else
    // use local environment JWT configuration.
    if (KEYCLOAK_ENABLED === 'true') {
      defaultLog.info('Keycloak Enabled, remote JWT verification.');
      const client = jwksClientInstance;

      let kid;
      try {
        const decoded = jwt.decode(tokenString, { complete: true });
        if (!decoded || !decoded.header || !decoded.header.kid) {
          defaultLog.warn('JWT header or kid missing');
          return callback(sendError());
        }
        kid = decoded.header.kid;
      } catch (decodeErr) {
        defaultLog.error('Failed to decode JWT header:', decodeErr.message);
        return callback(sendError());
      }

      client.getSigningKey(kid, (err, key) => {
        if (err) {
          defaultLog.error(`Signing Key Error:: ${err.message}`);
          callback(sendError());
        } else {
          const signingKey = key.publicKey || key.rsaPublicKey;

          _verifySecret(currentScopes, tokenString, signingKey, req, callback, sendError);
        }
      });
    } else {
      defaultLog.debug('Local JWT verification.');
      if (SECRET === 'defaultSecret') {
        defaultLog.error('KEYCLOAK_ENABLED is false but SECRET is unset or set to defaultSecret. Denying access.');
        return callback(sendError());
      }
      _verifySecret(currentScopes, tokenString, SECRET, req, callback, sendError);
    }
  } else {
    defaultLog.error('Token didn\'t have a bearer.');
    console.log('current:', currentScopes);
    if (!req.swagger.apiPath.startsWith('/public')
        && (req.swagger.operationPath[2] !== 'get' && req.swagger.operationPath[2] !== 'option' && req.swagger.operationPath[2] !== 'head')) {
      return callback(sendError());
    }

    req.swagger.params.auth_payload = {
      realm_access: {
        roles: ['public']
      },
      preferred_username: 'public'
    };
    return callback(null);
  }
};

function _verifySecret (currentScopes, tokenString, secret, req, callback, sendError) {
  // Pinning verification algorithms to RS256 for Keycloak remote JWKS, or HS256 for local SECRET.
  // Aud is verified downstream or configured on verification options if desired.
  const options = {
    algorithms: KEYCLOAK_ENABLED === 'true' ? ['RS256'] : ['HS256'],
    issuer: ISSUER
  };
  if (process.env.SSO_AUDIENCE) {
    options.audience = process.env.SSO_AUDIENCE;
  }

  jwt.verify(tokenString, secret, options, function(
    verificationError,
    decodedToken
  ) {
    // defaultLog.info("verificationError:", verificationError);
    // defaultLog.info("decodedToken:", decodedToken);

    // check if the JWT was verified correctly
    if (verificationError == null &&
        // Array.isArray(currentScopes) &&
        decodedToken &&
        decodedToken.realm_access &&
        decodedToken.realm_access.roles
    ) {
      // check if the issuer matches
      var issuerMatch = decodedToken.iss == ISSUER;

      // Check if user has at least one of the required x-security-scopes
      var roleMatch = !currentScopes || currentScopes.length === 0 || currentScopes.some(role => decodedToken.realm_access.roles.includes(role));

      if (roleMatch && issuerMatch) {
        // add the token to the request so that we can access it in the endpoint code if necessary
        req.swagger.params.auth_payload = decodedToken;
        defaultLog.debug('JWT verified for user: %s', decodedToken.preferred_username);
        return callback(null);
      } else {
        defaultLog.warn('JWT verification failed. roleMatch: %s, issuerMatch: %s for user: %s', roleMatch, issuerMatch, decodedToken.preferred_username);
        return callback(sendError());
      }
    } else {
      // return the error in the callback if the JWT was not verified
      defaultLog.warn('JWT verification failed: %s', verificationError && verificationError.message);
      return callback(sendError());
    }
  });
}

exports.issueToken = function(user,
  deviceId,
  scopes) {
  var crypto = require('crypto');
  var randomString = crypto.randomBytes(32).toString('hex');
  var jti = crypto.createHash('sha256').update(user.username + deviceId + randomString).digest('hex');

  var payload = {
    name: user.username,
    preferred_username: user.username,
    userID: user._id,
    deviceId: deviceId,
    jti: jti,
    iss: ISSUER,
    realm_access: {
      roles: scopes
    }
  };

  var token = jwt.sign(payload,
    SECRET,
    {expiresIn: JWT_SIGN_EXPIRY + 'm'});
  defaultLog.debug('Issuing token, expiresIn: %sm', JWT_SIGN_EXPIRY);

  return token;
};

var hashPassword = function (user, password) {
  if (user.salt && password) {
    var crypto = require('crypto');
    return crypto.pbkdf2Sync(password, Buffer.from(user.salt, 'base64'), 10000, 64, 'sha1').toString('base64');
  } else {
    return password;
  }
};

exports.setPassword = function (user) {
  const crypto = require('crypto');
  user.salt = crypto.randomBytes(16).toString('base64');
  user.password = hashPassword(user, user.password);
  return user;
};
/**
 * Create instance method for authenticating user
 */
var authenticate = function (user, password) {
  return user.password === hashPassword(user, password);
};

exports.checkAuthentication = function (username, password, cb) {
  var User = require('mongoose').model('User');

  // Look this user up in the db and hash their password to see if it's correct.
  User.findOne({
    username: username.toLowerCase()
  }, function (err, user) {
    if (err) {
      defaultLog.error('checkAuthentication error: %s', err.message);
      return cb(err);
    }
    if (!user || !authenticate(user, password)) {
      defaultLog.debug('Invalid username or password for: %s', username);
      return cb(null, false, {
        message: 'Invalid username or password'
      });
    }
    return cb(null, user);
  });
};