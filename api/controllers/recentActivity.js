var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

var getSanitizedFields = function (fields) {
  return _.remove(fields, function (f) {
    return (_.indexOf([
      '_schemaName',
      'dateUpdated',
      'dateAdded',
      'pinned',
      'documentUrl',
      'contentUrl',
      'type',
      'notificationName',
      'projectNotification',
      'pcp',
      'active',
      'project',
      'content',
      'headline',
      'complianceAndEnforcement'
    ], f) !== -1);
  });
};
exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.publicGet = async function (args, res) {
  var fields = ['_schemaName',
    'dateUpdated',
    'dateAdded',
    'pinned',
    'documentUrl',
    'contentUrl',
    'type',
    'notificationName',
    'projectNotification',
    'pcp',
    'active',
    'project',
    'content',
    'headline',
    'complianceAndEnforcement'];
  var sort = {
    dateAdded: -1
  };
  var theFields = getSanitizedFields(fields);

  try {
    // Run pinned and unpinned queries in parallel — avoid sequential await latency.
    const [pinned, unpinned] = await Promise.all([
      Utils.runDataQuery('RecentActivity',
        ['public'],
        { '_schemaName': 'RecentActivity', active: true, pinned: true },
        theFields,
        null, sort, null, 4, false, null, false, false, true),
      Utils.runDataQuery('RecentActivity',
        ['public'],
        { '_schemaName': 'RecentActivity', active: true, pinned: false },
        theFields,
        null, sort, null, 4, false, null, false, false, true)
    ]);

    // Fill up to 4 items: pinned first, then unpinned as needed.
    const data = [...pinned, ...unpinned.slice(0, Math.max(0, 4 - pinned.length))];

    // Nullify empty project objects — occurs when the recentActivity references an
    // orphaned project ID; the lookup finds nothing, but the aggregation pipeline
    // still produces {} instead of null.
    data.forEach(item => {
      if (item.project && typeof item.project === 'object' && !Array.isArray(item.project) && !item.project._id) {
        item.project = null;
      }
    });

    Utils.recordAction('Get', 'RecentActivity', 'public');
    return Actions.sendResponse(res, 200, data);

  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedDelete = async function (args, res) {
  defaultLog.info('Deleting a RecentActivity(s)');
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  var RecentActivity = mongoose.model('RecentActivity');
  var query = {};
  // Build match query if on recentActivityId route
  if (args.swagger.params.recentActivityId) {
    query = Utils.buildQuery('_id', args.swagger.params.recentActivityId.value, query);
  }

  if (!Object.keys(query).length > 0) {
    // Don't allow unilateral delete.
    return Actions.sendResponse(res, 400, 'Can\'t delete entire collection.');
  }

  // Straight delete, don't isDelete=true them.
  try {
    const data = await RecentActivity.deleteMany(query);
    Utils.recordAction('Delete', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, args.swagger.params.recentActivityId ? args.swagger.params.recentActivityId.value : null);
    return Actions.sendResponse(res, 200, data);
  } catch (err) {
    return Actions.sendResponse(res, 400, err);
  }
};

//  Create a new RecentActivity
exports.protectedPost = async function (args, res) {
  var obj = args.swagger.params.recentActivity.value;
  defaultLog.info('Incoming new object:', obj);

  var RecentActivity = mongoose.model('RecentActivity');
  delete obj._id;
  var recentActivity = new RecentActivity(obj);
  // Define security tag defaults.  Default public and sysadmin.

  if (recentActivity.active) {
    recentActivity.read = ['sysadmin', 'staff', 'public'];
  } else {
    recentActivity.read = ['sysadmin', 'staff'];
  }

  recentActivity.pinned = false;

  recentActivity.dateAdded = new Date();
  recentActivity._addedBy = args.swagger.params.auth_payload.preferred_username;

  if (recentActivity.type !== 'Project Notification Public Comment Period') {
    recentActivity.notificationName = null;
  }

  try {
    var rec = await recentActivity.save();
    Utils.recordAction('Post', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, rec._id);
    defaultLog.info('Saved new RecentActivity object:', rec);
    return Actions.sendResponse(res, 200, rec);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing RecentActivity
exports.protectedPut = async function (args, res) {
  var objId = args.swagger.params.recentActivityId.value;
  defaultLog.info('ObjectID:', args.swagger.params.recentActivityId.value);

  var obj = args.swagger.params.RecentActivityObject.value;
  // Strip security tags - these will not be updated on this route.
  defaultLog.info('Incoming updated object:', obj);
  if (obj.active) {
    obj.read = ['sysadmin', 'staff', 'public'];
  } else {
    obj.read = ['sysadmin', 'staff'];
  }
  // TODO sanitize/update audits.
  obj._updatedBy = args.swagger.params.auth_payload.preferred_username;

  if (obj.type !== 'Project Notification Public Comment Period') {
    obj.notificationName = null;
  }

  var RecentActivity = require('mongoose').model('RecentActivity');
  try {
    if ( obj.project && Object.keys(obj.project).length === 0 && obj.project.constructor === Object){
      obj.project = null;
    }

    var rec = await RecentActivity.findOneAndUpdate({ _id: objId }, obj, { upsert: false });
    Utils.recordAction('Put', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, rec._id);
    defaultLog.info('Updated RecentActivity object:', rec._id);
    return Actions.sendResponse(res, 200, rec);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};
