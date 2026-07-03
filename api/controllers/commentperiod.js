var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

const ALLOWED_FIELDS = [
  '_schemaName',
  'addedBy',
  'additionalText',
  'ceaaAdditionalText',
  'ceaaInformationLabel',
  'ceaaRelatedDocuments',
  'classificationRoles',
  'classifiedPercent',
  'commenterRoles',
  'dateAdded',
  'dateCompleted',
  'dateCompletedEst',
  'dateStarted',
  'dateStartedEst',
  'dateUpdated',
  'downloadRoles',
  'informationLabel',
  'instructions',
  'commentTip',
  'isClassified',
  'isPublished',
  'isResolved',
  'isVetted',
  'isMet',
  'metURL',
  'metURLAdmin',
  'metBannerImageUrl',
  'milestone',
  'openHouses',
  'periodType',
  'phase',
  'phaseName',
  'project',
  'publishedPercent',
  'rangeOption',
  'rangeType',
  'relatedDocuments',
  'resolvedPercent',
  'updatedBy',
  'userCan',
  'vettedPercent',
  'vettingRoles',
  'read',
  'write',
  'delete'
];

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.publicGet = async function (args, res) {
  defaultLog.info('Public get for comment period');

  var query = {}, sort = {};

  if (args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.commentPeriodId.value, query);
  }
  if (args.swagger.params.project && args.swagger.params.project.value) {
    query = Utils.buildQuery('project', args.swagger.params.project.value, query);
  }

  // sort — only accepted fields
  if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
    args.swagger.params.sortBy.value.forEach(function (value) {
      var order_by = value.charAt(0) == '-' ? -1 : 1;
      var sort_by = value.slice(1);
      switch (sort_by) {
      case 'dateStarted':
      case 'dateCompleted':
      case 'author':
        sort[sort_by] = order_by;
        break;
      }
    }, this);
  }

  Object.assign(query, { '_schemaName': 'CommentPeriod' });

  try {
    var data = await Utils.runDataQuery('CommentPeriod',
      ['public'],
      query,
      Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS),
      null, // sort warmup
      sort, // sort
      null, // skip
      null, // limit
      false); // count

    Utils.recordAction('Get', 'CommentPeriod', 'public', args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value ? args.swagger.params.commentPeriodId.value : null);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedHead = async function (args, res) {
  defaultLog.info('Head for comment period');

  var query = {};
  if (args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.commentPeriodId.value, query);
  }
  if (args.swagger.params.project && args.swagger.params.project.value) {
    query = Utils.buildQuery('project', args.swagger.params.project.value, query);
  }
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value != undefined) {
    Object.assign(query, { isDeleted: args.swagger.params.isDeleted.value });
  }

  Object.assign(query, { '_schemaName': 'CommentPeriod' });

  try {
    var data = await Utils.runDataQuery('CommentPeriod',
      args.swagger.params.auth_payload.realm_access.roles,
      query,
      ['_id', 'read', 'write', 'delete'],
      null, null, null, null,
      true); // count

    Utils.recordAction('Head', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value ? args.swagger.params.commentPeriodId.value : null);

    if (!(args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value) || (data && data.length > 0)) {
      res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
      return Actions.sendResponse(res, 200, data);
    } else {
      return Actions.sendResponse(res, 404, data);
    }
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedSummary = async function (args, res) {
  defaultLog.info('Head for comment period summaries');

  let cpId;
  try {
    cpId = Utils.getValidObjectId(args.swagger.params.commentPeriodId);
  } catch (e) {
    return Actions.sendResponse(res, 400, {});
  }

  var query = {};
  if (cpId) {
    Object.assign(query, { period: cpId });
  }
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value != undefined) {
    Object.assign(query, { isDeleted: args.swagger.params.isDeleted.value });
  }

  Object.assign(query, { '_schemaName': 'Comment' });

  Utils.recordAction('summary', 'commentPeriod', args.swagger.params.auth_payload.preferred_username);

  var options = ['Pending', 'Deferred', 'Published', 'Rejected'];
  try {
    var summary = { 'Pending': 0, 'Deferred': 0, 'Published': 0, 'Rejected': 0 };
    await Promise.all(options.map(async (item) => {
      var optionQuery = { 'eaoStatus': item, period: cpId };
      var result = await Utils.runDataQuery('CommentPeriod',
        args.swagger.params.auth_payload.realm_access.roles,
        optionQuery,
        ['_id', 'read', 'write', 'delete'],
        null, null, null, null,
        true); // count
      Utils.recordAction('Summary', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value ? args.swagger.params.commentPeriodId.value : null);
      if (result && result[0]) {
        summary[item] = result[0]['total_items'];
      }
    }));

    return Actions.sendResponse(res, 200, summary);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};


exports.protectedGet = async function (args, res) {
  defaultLog.info('Getting comment period(s)');

  var query = {}, sort = null, skip = null, limit = null, count = false;

  if (args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value) {
    defaultLog.info('Comment period id:', args.swagger.params.commentPeriodId.value);
    query = Utils.buildQuery('_id', args.swagger.params.commentPeriodId.value, query);
  }

  if (args.swagger.params.project && args.swagger.params.project.value) {
    let projId;
    try {
      projId = Utils.getValidObjectId(args.swagger.params.project);
    } catch (e) {
      return Actions.sendResponse(res, 400, {});
    }
    Object.assign(query, { project: projId });
  }

  if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
    sort = {};
    args.swagger.params.sortBy.value.forEach(function (value) {
      var order_by = value.charAt(0) == '-' ? -1 : 1;
      var sort_by = value.slice(1);
      sort[sort_by] = order_by;
    }, this);
  }

  var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
  skip = processedParameters.skip;
  limit = processedParameters.limit;

  if (args.swagger.params.count && args.swagger.params.count.value) {
    count = args.swagger.params.count.value;
  }

  Object.assign(query, { '_schemaName': 'CommentPeriod' });

  try {
    var data = await Utils.runDataQuery('CommentPeriod',
      args.swagger.params.auth_payload.realm_access.roles,
      query,
      Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS),
      null,   // sort warmup
      sort,   // sort
      skip,   // skip
      limit,  // limit
      count); // count
    Utils.recordAction('Get', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, args.swagger.params.commentPeriodId && args.swagger.params.commentPeriodId.value ? args.swagger.params.commentPeriodId.value : null);
    defaultLog.info('Got comment period(s):', data);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

//  Create a new CommentPeriod
exports.protectedPost = async function (args, res) {
  var obj = args.swagger.params.period.value;

  defaultLog.info('Incoming new comment period:', obj);

  var CommentPeriod = mongoose.model('CommentPeriod');

  // TODO: Make milestone lookup against "Time Limit Imposition" set for all isMet = true based calls.

  var commentPeriod = new CommentPeriod({
    _schemaName: 'CommentPeriod',
    addedBy: args.swagger.params.auth_payload.preferred_username,
    commentIdCount: 0,
    dateAdded: new Date(),
    isMet: obj.isMet,
    metURL: obj.metURL,
    metURLAdmin: obj.metURLAdmin,
    metBannerImageUrl: obj.metBannerImageUrl,
    dateCompleted: obj.dateCompleted,
    dateStarted: obj.dateStarted,
    instructions: obj.instructions,
    informationLabel: obj.informationLabel,
    commentTip: obj.commentTip,
    milestone: new mongoose.Types.ObjectId(obj.milestone),
    openHouses: obj.openHouses,
    relatedDocuments: obj.relatedDocuments,
    project: new mongoose.Types.ObjectId(obj.project),
    read: ['staff', 'sysadmin'],
    write: ['staff', 'sysadmin'],
    delete: ['staff', 'sysadmin']
  });

  if (obj.isPublished) {
    commentPeriod.read.push('public');
  }

  try {
    var cp = await commentPeriod.save();
    Utils.recordAction('Put', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, cp._id);
    defaultLog.info('Saved new comment period object:', cp);
    return Actions.sendResponse(res, 200, cp);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing CommentPeriod
exports.protectedPut = async function (args, res) {
  let objId;
  try {
    objId = Utils.getValidObjectId(args.swagger.params.commentPeriodId);
  } catch (e) {
    return Actions.sendResponse(res, 400, {});
  }

  var obj = args.swagger.params.cp.value;
  defaultLog.info('Put comment period:', objId);

  var CommentPeriod = mongoose.model('CommentPeriod');

  var commentPeriod = {
    commentTip: obj.commentTip,
    dateCompleted: obj.dateCompleted,
    dateStarted: obj.dateStarted,
    dateUpdated: new Date(),
    isMet: obj.isMet,
    instructions: obj.instructions,
    informationLabel: obj.informationLabel,
    metURL: obj.metURL,
    metBannerImageUrl: obj.metBannerImageUrl,
    milestone: new mongoose.Types.ObjectId(obj.milestone),
    openHouses: obj.openHouses,
    relatedDocuments: obj.relatedDocuments,
    updatedBy: args.swagger.params.auth_payload.preferred_username,
  };

  // TODO: Revise so we are not explicitly setting permissions
  commentPeriod['read'] = obj.isPublished
    ? ['public', 'staff', 'sysadmin']
    : ['staff', 'sysadmin'];

  defaultLog.info('Incoming updated object:', commentPeriod);

  try {
    var cp = await CommentPeriod.updateOne({ _id: objId }, { $set: commentPeriod });
    Utils.recordAction('Put', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Comment period updated:', cp);
    return Actions.sendResponse(res, 200, cp);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

//  Delete a CommentPeriod
exports.protectedDelete = async function (args, res) {
  let objId;
  try {
    objId = Utils.getValidObjectId(args.swagger.params.commentPeriodId);
  } catch (e) {
    return Actions.sendResponse(res, 400, {});
  }
  defaultLog.info('Delete comment period:', objId);
  var CommentPeriod = mongoose.model('CommentPeriod');
  try {
    await CommentPeriod.findOneAndDelete({ _id: objId });
    Utils.recordAction('Delete', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, objId);
    return Actions.sendResponse(res, 200, {});
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

// Publish/Unpublish the CommentPeriod
exports.protectedPublish = async function (args, res) {
  let objId;
  try {
    objId = Utils.getValidObjectId(args.swagger.params.commentPeriodId);
  } catch (e) {
    return Actions.sendResponse(res, 400, {});
  }
  defaultLog.info('Publish comment period:', objId);
  var CommentPeriod = mongoose.model('CommentPeriod');
  try {
    var commentPeriod = await CommentPeriod.findOne({ _id: objId });
    delete commentPeriod.__v;
    defaultLog.info('Comment period object:', commentPeriod);
    var published = await Actions.publish(commentPeriod);
    Utils.recordAction('Publish', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, objId);
    return Actions.sendResponse(res, 200, published);
  } catch (e) {
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedUnPublish = async function (args, res) {
  let objId;
  try {
    objId = Utils.getValidObjectId(args.swagger.params.commentPeriodId);
  } catch (e) {
    return Actions.sendResponse(res, 400, {});
  }
  defaultLog.info('UnPublish comment period:', objId);
  var CommentPeriod = mongoose.model('CommentPeriod');
  try {
    var commentPeriod = await CommentPeriod.findOne({ _id: objId });
    delete commentPeriod.__v;
    defaultLog.info('Comment period object:', commentPeriod);
    var unpublished = await Actions.unPublish(commentPeriod);
    Utils.recordAction('Unpublish', 'CommentPeriod', args.swagger.params.auth_payload.preferred_username, objId);
    return Actions.sendResponse(res, 200, unpublished);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};
