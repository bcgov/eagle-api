const defaultLog = require('winston').loggers.get('default');
var Actions = require('../helpers/actions');

exports.publicGetConfig = async function (args, res) {
  // Build from ENV Vars
  let configObj = {
    debugMode: process.env.DEBUG_MODE,
    ENVIRONMENT: process.env.ENVIRONMENT,
    BANNER_COLOUR: process.env.BANNER_COLOUR,
    API_LOCATION: process.env.API_LOCATION,
    API_PATH: process.env.API_PATH,
    API_PUBLIC_PATH:process.env.API_PUBLIC_PATH,
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_URL: process.env.KEYCLOAK_URL,
    KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
    KEYCLOAK_ENABLED: process.env.KEYCLOAK_ENABLED
  };

  defaultLog.info('Current configuration:', configObj);
  return Actions.sendResponse(res, 200, configObj);
};

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};
