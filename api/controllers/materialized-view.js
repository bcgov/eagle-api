'use strict';

const Actions = require('../helpers/actions');
const { getLockInfo } = require('../materialized_views/runLock');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedGetStatus = async function (args, res) {
  const [hot, cold, all] = await Promise.all([
    getLockInfo('mat_view_hot'),
    getLockInfo('mat_view_cold'),
    getLockInfo('mat_view_all'),
  ]);

  return Actions.sendResponse(res, 200, { hot, cold, all });
};
