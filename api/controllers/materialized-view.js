'use strict';

const defaultLog = require('winston').loggers.get('default');
const Actions = require('../helpers/actions');
const { updateHotViews, updateColdViews, updateAllMaterializedViews } = require('../materialized_views/updateViews');
const { isLocked, getLockInfo, forceRelease } = require('../materialized_views/runLock');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedRefresh = async function (args, res) {
  const body = args.swagger.params.body && args.swagger.params.body.value;
  const subset = (body && body.subset) || 'all';
  const force  = !!(body && body.force);

  if (!['hot', 'cold', 'all'].includes(subset)) {
    return Actions.sendResponse(res, 400, { error: 'subset must be hot, cold, or all' });
  }

  const lockId = subset === 'all' ? 'mat_view_all' : `mat_view_${subset}`;

  if (force) {
    await forceRelease(lockId, defaultLog);
  } else {
    const locked = await isLocked(lockId);
    if (locked) {
      return Actions.sendResponse(res, 409, { error: 'Refresh already in progress', lockId });
    }
  }

  switch (subset) {
    case 'hot':  updateHotViews(defaultLog); break;
    case 'cold': updateColdViews(defaultLog); break;
    default:     updateAllMaterializedViews(defaultLog); break;
  }

  const user = args.swagger.params.auth_payload && args.swagger.params.auth_payload.preferred_username;
  defaultLog.info(`[mat-view] manual refresh triggered: subset=${subset}, user=${user}`);

  return Actions.sendResponse(res, 202, { message: 'Refresh started', subset });
};

exports.protectedGetStatus = async function (args, res) {
  const [hot, cold, all] = await Promise.all([
    getLockInfo('mat_view_hot'),
    getLockInfo('mat_view_cold'),
    getLockInfo('mat_view_all'),
  ]);

  return Actions.sendResponse(res, 200, { hot, cold, all });
};
