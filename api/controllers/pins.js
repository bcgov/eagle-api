var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

const handleGetPins = async function (projectId, roles, sortBy, pageSize, pageNum, username, res) {
  defaultLog.info('Getting pins for project:', projectId && projectId.value);

  if (!projectId || !projectId.value || !mongoose.Types.ObjectId.isValid(projectId.value)) {
    defaultLog.info('Invalid or missing projectId for pin query');
    return Actions.sendResponse(res, 400, 'error');
  }

  var skip = null, limit = null, sort = null;
  var fields = ['_id', 'pins', 'name', 'website', 'province', 'pinsRead'];

  try {
    var data = await Utils.runDataQuery('Project',
      roles,
      { '_schemaName': 'Project', _id: new mongoose.Types.ObjectId(projectId.value) },
      fields,
      null, null, null, null,
      false, // count
      null,
      true,   // proponent populate
      null);

    if (!data || data.length === 0) {
      defaultLog.info('Project not found or no permission, projId:', projectId.value);
      return Actions.sendResponse(res, 200, [{ total_items: 0 }]);
    }

    if (!data[0].pins || data[0].pins.length === 0) {
      defaultLog.info('No pins for project:', projectId.value);
      return Actions.sendResponse(res, 200, [{ total_items: 0 }]);
    }

    if (data[0].pinsRead && !data[0].pinsRead.includes('public') && username === 'public') {
      defaultLog.info('Pins not yet published for project:', projectId.value);
      return Actions.sendResponse(res, 200, [{ total_items: 0 }]);
    }

    const thePins = data[0].pins.map(pin => new mongoose.Types.ObjectId(pin));
    const read = data[0].pinsRead;

    // Sort
    if (sortBy && sortBy.value) {
      sort = {};
      sortBy.value.forEach(function (value) {
        var order_by = value.charAt(0) == '-' ? -1 : 1;
        var sort_by = value.slice(1);
        sort[sort_by] = order_by;
      }, this);
    }

    // Skip and limit
    var processedParameters = Utils.getSkipLimitParameters(pageSize, pageNum);
    skip = processedParameters.skip;
    limit = processedParameters.limit;

    // Use direct mongoose query to bypass $redact permission filter.
    // PIN-linked orgs are explicitly admin-managed and must be visible to all admin users
    // regardless of the org document's read field values.
    var OrgModel = mongoose.model('Organization');
    var orgQuery = OrgModel.find({ _id: { $in: thePins } })
      .select('_id name website province read');
    if (sort) { orgQuery = orgQuery.sort(sort); }
    if (skip != null) { orgQuery = orgQuery.skip(skip); }
    if (limit != null) { orgQuery = orgQuery.limit(limit); }

    const [orgs, totalCount] = await Promise.all([
      orgQuery.lean(),
      OrgModel.countDocuments({ _id: { $in: thePins } })
    ]);

    // Return in same shape as runDataQuery count:true — [{ total_items, results, read }]
    const orgData = [{
      total_items: totalCount,
      results: orgs,
      read: read ? read.slice() : []
    }];

    Utils.recordAction('Get', 'Pin', username, projectId.value);
    defaultLog.info('Got pins for project:', projectId.value);
    return Actions.sendResponse(res, 200, orgData);
  } catch (e) {
    defaultLog.error(`Error getting pins for project: ${projectId.value}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.publicPinGet = async function (args, res) {
  defaultLog.info('publicPinGet for project:', args.swagger.params.projId && args.swagger.params.projId.value);
  return handleGetPins(
    args.swagger.params.projId,
    ['public'],
    args.swagger.params.sortBy,
    args.swagger.params.pageSize,
    args.swagger.params.pageNum,
    'public',
    res
  );
};

exports.protectedPinGet = async function (args, res) {
  defaultLog.info('protectedPinGet for project:', args.swagger.params.projId && args.swagger.params.projId.value);
  return handleGetPins(
    args.swagger.params.projId,
    args.swagger.params.auth_payload.realm_access.roles,
    args.swagger.params.sortBy,
    args.swagger.params.pageSize,
    args.swagger.params.pageNum,
    args.swagger.params.auth_payload.preferred_username,
    res
  );
};

exports.protectedAddPins = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  defaultLog.info('Adding pins to project:', objId);

  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }

  var Project = mongoose.model('Project');
  var pinsArr = args.swagger.params.pins.value.map(item => new mongoose.Types.ObjectId(item));

  try {
    var doc = await Project.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(objId) },
      { $push: { pins: { $each: pinsArr } } },
      { new: true }
    );
    if (doc) {
      Utils.recordAction('Add', 'Pin', args.swagger.params.auth_payload.preferred_username, objId);
      defaultLog.info('Added', pinsArr.length, 'pin(s) to project:', objId);
      return Actions.sendResponse(res, 200, { pins: doc.pins });
    } else {
      defaultLog.info('Project not found:', objId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error adding pins to project: ${objId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

// pinsRead is on the project level and controls visibility of all pins for the project
exports.protectedPublishPin = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  defaultLog.info('Publishing pins for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var Project = mongoose.model('Project');
  try {
    var project = await Project.findOne({ _id: projId });
    if (project && project.pins) {
      var published = await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $addToSet: { 'pinsRead': 'public' } }
      );
      Utils.recordAction('Publish', 'PIN', args.swagger.params.auth_payload.preferred_username, projId);
      defaultLog.info('Published pins for project:', projId);
      return Actions.sendResponse(res, 200, published);
    } else {
      defaultLog.info('Project not found or has no pins:', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error publishing pins for project: ${projId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedUnPublishPin = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  defaultLog.info('Unpublishing pins for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var Project = mongoose.model('Project');
  try {
    var project = await Project.findOne({ _id: projId });
    if (project && project.pins) {
      var updated = await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $pull: { 'pinsRead': 'public' } }
      );
      Utils.recordAction('Unpublish', 'PIN', args.swagger.params.auth_payload.preferred_username, projId);
      defaultLog.info('Unpublished pins for project:', projId);
      return Actions.sendResponse(res, 200, updated);
    } else {
      defaultLog.info('Project not found or has no pins:', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error unpublishing pins for project: ${projId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedPinDelete = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  var pinId = args.swagger.params.pinId.value;
  defaultLog.info('Deleting pin:', pinId, 'from project:', projId);

  if (!mongoose.Types.ObjectId.isValid(pinId)) {
    return Actions.sendResponse(res, 400, {});
  }

  var Project = mongoose.model('Project');
  try {
    var data = await Project.updateOne(
      { _id: projId },
      { $pull: { pins: { $in: [new mongoose.Types.ObjectId(pinId)] } } }
    );
    Utils.recordAction('Delete', 'Pin', args.swagger.params.auth_payload.preferred_username, pinId);
    defaultLog.info('Deleted pin:', pinId, 'from project:', projId);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error deleting pin: ${pinId} from project: ${projId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};
