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
  try {
    var RecentActivity = mongoose.model('RecentActivity');

    // Build a focused pipeline that sorts and limits BEFORE running $lookups.
    // The old approach ran 3 $lookups on all 2,462 active items and then
    // discarded all but 4.  Moving $sort+$limit up front means the $lookups
    // only process 4 documents — cutting response time from ~1.7 s to ~300 ms.
    var projection = {
      _id: 1, _schemaName: 1, dateUpdated: 1, dateAdded: 1, pinned: 1,
      documentUrl: 1, contentUrl: 1, type: 1, notificationName: 1,
      projectNotification: 1, pcp: 1, active: 1, project: 1,
      content: 1, headline: 1, complianceAndEnforcement: 1,
      code: 1, proponent: 1, tags: 1, read: 1
    };

    function buildPipeline(pinnedValue) {
      return [
        { $match: { _schemaName: 'RecentActivity', active: true, pinned: pinnedValue } },
        { $sort: { dateAdded: -1 } },
        { $limit: 4 },
        // --- lookups now run on at most 4 docs ---
        { $lookup: { from: 'epic', localField: 'project', foreignField: '_id', as: 'project' } },
        { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'epic', localField: 'pcp', foreignField: '_id', as: 'pcp' } },
        { $unwind: { path: '$pcp', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'epic', localField: 'project._id', foreignField: '_id', as: 'projectNotification' } },
        { $unwind: { path: '$projectNotification', preserveNullAndEmptyArrays: true } },
        // Unpack legislation data into the populated project
        { $addFields: { 'project.default': { $switch: {
          branches: [
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_1996'] }, then: '$project.legislation_1996' },
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_2002'] }, then: '$project.legislation_2002' },
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_2018'] }, then: '$project.legislation_2018' }
          ],
          default: '$project.legislation_2002'
        }}}},
        { $addFields: {
          'project.default._id': '$project._id',
          'project.default.read': '$project.read',
          'project.default.pins': '$project.pins',
          'project.default.pinsHistory': '$project.pinsHistory',
          'project.default.pinsRead': '$project.pinsRead'
        }},
        { $addFields: { project: '$project.default' } },
        // Field selection — match the old runDataQuery projection
        { $project: projection },
        // Role-based access control
        { $redact: { $cond: {
          if: { $and: [
            { $cond: { if: '$read', then: true, else: false } },
            { $anyElementTrue: { $map: {
              input: '$read', as: 'fieldTag',
              in: { $setIsSubset: [['$$fieldTag'], ['public']] }
            }}}
          ]},
          then: '$$KEEP',
          else: { $cond: { if: '$read', then: '$$PRUNE', else: '$$DESCEND' } }
        }}}
      ];
    }

    var collation = { locale: 'en', strength: 2 };
    const [pinned, unpinned] = await Promise.all([
      RecentActivity.aggregate(buildPipeline(true)).collation(collation).exec(),
      RecentActivity.aggregate(buildPipeline(false)).collation(collation).exec()
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
