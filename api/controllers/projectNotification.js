const defaultLog = require('winston').loggers.get('default');
const mongoose = require('mongoose');
const Actions = require('../helpers/actions');
const Utils = require('../helpers/utils');
const constants = require('../helpers/constants');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

//  Create a new Project Notification
exports.protectedPost = async function (args, res) {
  const requestData = args.swagger.params.projectNotification.value;
  defaultLog.info('Incoming new project notification object:', requestData);

  const ProjectNotification = mongoose.model('ProjectNotification');
  const projectNotification = new ProjectNotification({
    ...requestData,
    read: constants.SECURE_ROLES,
    write: constants.SECURE_ROLES,
    delete: constants.SECURE_ROLES
  });

  if (args.swagger.params.publish && args.swagger.params.publish.value) {
    projectNotification.read.push('public');
  }

  try {
    const saveProjectNotification = await projectNotification.save();
    Utils.recordAction('Post', 'ProjectNotification', args.swagger.params.auth_payload.preferred_username, saveProjectNotification._id);

    defaultLog.info('Saved new project notification object:', saveProjectNotification);
    return Actions.sendResponse(res, 201, saveProjectNotification);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an project notification
exports.protectedPut = async function (args, res) {
  const projectNotificationId = args.swagger.params.projectNotificationId.value;
  const requestData = args.swagger.params.projectNotification.value;
  const publish = args.swagger.params.publish && args.swagger.params.publish.value;
  const NotificationProject = require('mongoose').model('ProjectNotification');

  try {
    const projectNotification = await NotificationProject.findOne({ _id: projectNotificationId });
    if (!projectNotification) {
      return Actions.sendResponse(res, 404, {});
    }

    // Manually map in order to provide defaults.
    projectNotification.name = requestData.name || '';
    projectNotification.type = requestData.type || '';
    projectNotification.subType = requestData.subType || '';
    projectNotification.proponent = requestData.proponent || '';
    projectNotification.nature = requestData.nature || '';
    projectNotification.region = requestData.region || '';
    projectNotification.location = requestData.location || '';
    projectNotification.trigger = requestData.trigger || '';
    projectNotification.decision = requestData.decision || '';
    projectNotification.decisionDate = requestData.decisionDate || '';
    projectNotification.notificationReceivedDate = requestData.notificationReceivedDate || '';
    projectNotification.description = requestData.description || '';
    projectNotification.notificationThresholdValue = requestData.notificationThresholdValue || '';
    projectNotification.notificationThresholdUnits = requestData.notificationThresholdUnits || '';
    projectNotification.centroid = requestData.centroid || [];
    projectNotification.associatedProjectId = requestData.associatedProjectId || '';
    projectNotification.associatedProjectName = requestData.associatedProjectName || '';

    // Only update read permission if it is currently not set.
    if (publish && !projectNotification.read.includes('public')) {
      projectNotification.read.push('public');
    }

    if (publish === false) {
      projectNotification.read = projectNotification.read.filter(permission => permission !== 'public');
    }

    const updatedRecord = await projectNotification.save();
    Utils.recordAction('Put', 'ProjectNotification', args.swagger.params.auth_payload.preferred_username, projectNotificationId);
    defaultLog.info('Project Notification updated:', updatedRecord);
    return Actions.sendResponse(res, 200, updatedRecord);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};
