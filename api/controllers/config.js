const defaultLog = require('winston').loggers.get('default');
var Actions = require('../helpers/actions');

exports.publicGetConfig = async function (args, res) {
  // Build from ENV Vars
  const envObj = process.env;
  let configObj = {};

  Object.keys(envObj).forEach(function (key) {
    if (key.startsWith('CONFIG_')) {
      configObj[key] = envObj[key];
    }
  });

  defaultLog.info('Current configuration:', configObj);
  return Actions.sendResponse(res, 200, configObj);
};

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};
