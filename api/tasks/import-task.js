'use strict';

const defaultLog = require('winston').loggers.get('default');
const Actions = require('../helpers/actions');

const { updateAllMaterializedViews } = require('../materialized_views/updateViews');

exports.protectedOptions = async function (args, res) {
  res.status(200).send();
};

/*Required fields for type of task:
updateMaterializedView:
{
  taskType: updateMaterializedView
}*/
exports.protectedCreateTask = async function (args, res) {
  // validate request parameters
  if (!args.swagger.params.task || !args.swagger.params.task.value) {
    defaultLog.error('protectedCreateTask - missing required request body');
    return Actions.sendResponse(res, 400, 'protectedCreateTask - missing required request body');
  }
  if (!args.swagger.params.task.value.taskType) {
    defaultLog.error('protectedCreateTask - missing required taskType');
    return Actions.sendResponse(res, 400, 'protectedCreateTask - missing required taskType');
  }

  switch (args.swagger.params.task.value.taskType) {
    case 'updateMaterializedView':
      switch (args.swagger.params.task.value.materializedViewSubset) {
        case 'default':
          updateAllMaterializedViews(defaultLog);
          break;
        default:
          defaultLog.error(`protectedCreateTask - unknown materialized view subset`);
          return Actions.sendResponse(res, 400, `protectedCreateTask - unknown materialized view subset`);
      }
      break;
    default:
      defaultLog.error('protectedCreateTask - unknown taskType');
      return Actions.sendResponse(res, 400, 'protectedCreateTask - unknown taskType');
  }
  // send response immediately as the tasks will run in the background
  return Actions.sendResponse(res, 200);
};
