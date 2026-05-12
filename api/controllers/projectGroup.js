var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedAddGroup = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  defaultLog.info('protectedAddGroup for project:', objId);
  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var groupName = args.swagger.params.group.value;
  defaultLog.info('Incoming new group:', groupName);

  var Group = mongoose.model('Group');
  var doc = new Group({ project: new mongoose.Types.ObjectId(objId), name: groupName.group });
  ['project-system-admin', 'sysadmin', 'staff'].forEach(item => {
    doc.read.push(item), doc.write.push(item), doc.delete.push(item);
  });
  doc._addedBy = args.swagger.params.auth_payload.preferred_username;
  try {
    var d = await doc.save();
    Utils.recordAction('Add', 'Group', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Saved new group object:', d);
    return Actions.sendResponse(res, 200, d);
  } catch (e) {
    defaultLog.error(`Error adding group to project: ${objId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedGroupPut = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  var groupId = args.swagger.params.groupId.value;
  defaultLog.info('protectedGroupPut for group:', groupId, 'in project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId) || !mongoose.Types.ObjectId.isValid(groupId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var obj = args.swagger.params.groupObject.value;

  var Group = mongoose.model('Group');
  try {
    var group = await Group.findOneAndUpdate({ _id: groupId }, obj, { upsert: false, returnDocument: 'after' });
    Utils.recordAction('Put', 'Group', args.swagger.params.auth_payload.preferred_username, groupId);
    defaultLog.info('Updated group:', groupId);
    return Actions.sendResponse(res, 200, group);
  } catch (e) {
    defaultLog.error(`Error updating group: ${groupId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedGroupDelete = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  var groupId = args.swagger.params.groupId.value;
  defaultLog.info('protectedGroupDelete for group:', groupId, 'in project:', objId);
  if (!mongoose.Types.ObjectId.isValid(objId) || !mongoose.Types.ObjectId.isValid(groupId)) {
    return Actions.sendResponse(res, 400, {});
  }

  var Group = mongoose.model('Group');
  try {
    var doc = await Group.findOneAndDelete({ _id: groupId });
    defaultLog.info('Deleted group:', doc);
    Utils.recordAction('Delete', 'Group', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Deleted group:', groupId, 'from project:', objId);
    return Actions.sendResponse(res, 200, {});
  } catch (e) {
    defaultLog.error(`Error deleting group: ${groupId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedAddGroupMembers = async function (args, res) {
  var projectId = args.swagger.params.projId.value;
  var groupId = args.swagger.params.groupId.value;
  defaultLog.info('protectedAddGroupMembers for group:', groupId, 'in project:', projectId);
  if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(groupId)) {
    return Actions.sendResponse(res, 400, {});
  }

  var Group = mongoose.model('Group');
  var membersArr = args.swagger.params.members.value.map(item => new mongoose.Types.ObjectId(item));

  try {
    var doc = await Group.updateOne(
      { _id: new mongoose.Types.ObjectId(groupId) },
      { $push: { members: { $each: membersArr } } }
    );
    if (doc) {
      Utils.recordAction('Add', 'GroupMember', args.swagger.params.auth_payload.preferred_username, groupId);
      defaultLog.info('Added', membersArr.length, 'member(s) to group:', groupId);
      return Actions.sendResponse(res, 200, doc);
    } else {
      defaultLog.info('Group not found:', groupId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error adding members to group: ${groupId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedGroupGetMembers = async function (args, res) {
  defaultLog.info('protectedGroupGetMembers for group:', args.swagger.params.groupId && args.swagger.params.groupId.value);
  return handleGetGroupMembers(
    args.swagger.params.groupId,
    args.swagger.params.auth_payload.realm_access.roles,
    args.swagger.params.sortBy,
    args.swagger.params.pageSize,
    args.swagger.params.pageNum,
    args.swagger.params.auth_payload.preferred_username,
    res
  );
};

const handleGetGroupMembers = async function (groupId, roles, sortBy, pageSize, pageNum, username, res) {
  defaultLog.info('Getting group members for group:', groupId && groupId.value);

  if (!groupId || !groupId.value || !mongoose.Types.ObjectId.isValid(groupId.value)) {
    defaultLog.info('Invalid or missing groupId for member query');
    return Actions.sendResponse(res, 400, 'error');
  }

  var fields = ['_id', 'members', 'name', 'project'];

  try {
    var data = await Utils.runDataQuery('Group',
      roles,
      { '_schemaName': 'Group', _id: new mongoose.Types.ObjectId(groupId.value) },
      fields,
      null, null, null, null,
      false, null, false, null
    );

    if (!data || data.length === 0) {
      defaultLog.info('Group not found or no permission:', groupId.value);
      return Actions.sendResponse(res, 200, [{ total_items: 0 }]);
    }

    const theUsers = data[0].members.map(user => new mongoose.Types.ObjectId(user));
    var userQuery = { _id: { $in: theUsers }, '_schemaName': 'User' };

    var sort = null;
    if (sortBy && sortBy.value) {
      sort = {};
      var order_by = sortBy.value.charAt(0) == '-' ? -1 : 1;
      var sort_by = sortBy.value.slice(1);
      sort[sort_by] = order_by;
    }

    var processedParameters = Utils.getSkipLimitParameters(pageSize, pageNum);
    var skip = processedParameters.skip;
    var limit = parseInt(processedParameters.limit);

    var userFields = ['_id', 'displayName', 'email', 'org', 'orgName', 'phoneNumber'];
    var groupData = await Utils.runDataQuery('User',
      roles,
      userQuery,
      userFields,
      null, sort, skip, limit,
      true); // count

    Utils.recordAction('Get', 'GroupMember', username, groupId.value);
    defaultLog.info('Got members for group:', groupId.value);
    return Actions.sendResponse(res, 200, groupData);
  } catch (e) {
    defaultLog.error(`Error getting group members for group: ${groupId.value}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedDeleteGroupMembers = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  var groupId = args.swagger.params.groupId.value;
  var memberId = args.swagger.params.memberId.value;
  defaultLog.info('Deleting group member:', memberId, 'from group:', groupId, 'in project:', projId);

  if (!mongoose.Types.ObjectId.isValid(projId) || !mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var Group = mongoose.model('Group');
  try {
    var data = await Group.updateOne(
      { _id: groupId },
      { $pull: { members: { $in: [new mongoose.Types.ObjectId(memberId)] } } }
    );
    Utils.recordAction('Delete', 'GroupMember', args.swagger.params.auth_payload.preferred_username, groupId);
    defaultLog.info('Deleted group member:', memberId, 'from group:', groupId);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error deleting group member: ${memberId} from group: ${groupId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};
