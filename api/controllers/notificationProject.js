var auth = require("../helpers/auth");
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
}

//  Create a new Notification Project
exports.protectedPost = async function (args, res, next) {
  var obj = args.swagger.params.notificationProject.value;
  defaultLog.info("Incoming new object:", obj);

  var NotificationProject = mongoose.model('NotificationProject');
  var notificationProject = new NotificationProject({
    name: obj.name,
    type: obj.type,
    subType: obj.subType,
    proponentName: obj.proponentName,
    startDate: obj.startDate,
    decisionDate: obj.decisionDate,
    orgName: obj.orgName,
    region: obj.region,
    notificationDecision: obj.notificationDecision,
    description: obj.description,
    centroid: obj.centroid,

    read: ['staff', 'sysadmin'],
    write: ['staff', 'sysadmin'],
    delete: ['staff', 'sysadmin']
  });

  if (args.swagger.params.publish && args.swagger.params.publish.value) {
    notificationProject.read.push('public');
  }

  try {
    var np = await notificationProject.save();
    Utils.recordAction('Put', 'NotificationProject', args.swagger.params.auth_payload.preferred_username, np._id);
    defaultLog.info('Saved new notification project object:', np);
    return Actions.sendResponse(res, 200, np);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing user
exports.protectedPut = async function (args, res, next) {
  var objId = args.swagger.params.notificationProjectId.value;
  var obj = args.swagger.params.notificationProject.value;
  defaultLog.info("ObjectID:", args.swagger.params.notificationProjectId.value);

  var NotificationProject = require('mongoose').model('NotificationProject');

  var notificationProject = {
    name: obj.name ? obj.name : '',
    type: obj.type ? obj.type : '',
    subType: obj.subType ? obj.subType : '',
    proponentName: obj.proponentName ? obj.proponentName : '',
    startDate: obj.startDate ? obj.startDate : null,
    decisionDate: obj.decisionDate ? obj.decisionDate : null,
    orgName: obj.orgName ? obj.orgName : '',
    region: obj.region ? obj.region : '',
    notificationDecision: obj.notificationDecision ? obj.notificationDecision : '',
    description: obj.description ? obj.description : '',
    centroid: obj.centroid ? obj.centroid : ['0', '0'],
    read: obj.read ? obj.read : ['staff', 'sysadmin']
  }

  if (args.swagger.params.publish && args.swagger.params.publish.value) {
    if (!notificationProject.read.includes('public')) {
      notificationProject.read.push('public');
    }
  } else if (args.swagger.params.publish && !args.swagger.params.publish.value) {
    if (notificationProject.read.includes('public')) {
      notificationProject.read = notificationProject.read.filter(function (value) {
        return value !== 'public';
      });
    }
  }

  defaultLog.info("Incoming updated object:", notificationProject);

  try {
    var np = await NotificationProject.findOneAndUpdate({ _id: objId }, notificationProject, { upsert: false, new: true }).exec();
    Utils.recordAction('Put', 'NotificationProject', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Notification Project updated:', np);
    return Actions.sendResponse(res, 200, np);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
}
