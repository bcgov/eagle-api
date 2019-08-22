var auth = require("../helpers/auth");
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var qs = require('qs');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var request = require('request');
var tagList = [
  'name',
  'project',
  'startDate',
  'endDate',
  'email',
  'label',
  'case'
];

var getSanitizedFields = function (fields) {
  return _.remove(fields, function (f) {
    return (_.indexOf(tagList, f) !== -1);
  });
}

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
}

//  Create a new inspection
exports.protectedPost = function (args, res, next) {
  var obj = args.swagger.params.inspection.value;

  defaultLog.info("Incoming new object:", obj);

  var Inspection = mongoose.model('Inspection');
  var inspection = new Inspection(obj);
  inspection.proponent = mongoose.Types.ObjectId(obj.proponent)
  // Define security tag defaults
  inspection.read = ['sysadmin', 'staff'];
  inspection.write = ['sysadmin', 'staff'];
  inspection.delete = ['sysadmin', 'staff'];
  inspection._createdBy = args.swagger.params.auth_payload.preferred_username;
  inspection.createdDate = Date.now();
  inspection.save()
    .then(function (theInspection) {
      Utils.recordAction('Post', 'Inspection', args.swagger.params.auth_payload.preferred_username, theInspection._id);
      theInspection.status = 'Submitted';
      return Actions.sendResponse(res, 200, theInspection);
    })
    .catch(function (err) {
      console.log("Error in API:", err);
      return Actions.sendResponse(res, 400, err);
    });
};
