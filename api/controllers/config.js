const defaultLog = require('winston').loggers.get('default');
var Actions = require('../helpers/actions');
const mongoose = require('mongoose');

exports.publicGetConfig = async function (args, res) {
  // TODO: Query configuration object.
  try {
    const Config = mongoose.model('Config');
    const configuration = await Config.findOne({_schemaName: 'Config'});
    defaultLog.info('Configuration Request:', configuration);
    return Actions.sendResponse(res, 200, configuration);
  } catch (e) {
    defaultLog.error('Error getting configuration', e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};
