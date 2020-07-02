var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
const moment = require('moment');

var getSanitizedFields = function (fields) {
  return _.remove(fields, function (f) {
    return (_.indexOf([
      'author',
      'comment',
      'commentId',
      'dateAdded',
      'datePosted',
      'dateUpdated',
      'documents',
      'eaoNotes',
      'eaoStatus',
      'submittedCAC',
      'isAnonymous',
      'location',
      'period',
      'proponentNotes',
      'proponentStatus',
      'publishedNotes',
      'rejectedNotes',
      'rejectedReason',
      'valuedComponents',
      'read',
      'write',
      'delete'
    ], f) !== -1);
  });
};

var setPermissionsFromEaoStatus = function (status, comment) {
  console.log(status);
  switch (status) {
  case 'Published':
    defaultLog.info('Publishing Comment');
    comment.eaoStatus = 'Published';
    comment.read = ['public', 'staff', 'sysadmin'];
    break;
  case 'Pending':
    defaultLog.info('Pending Comment');
    comment.eaoStatus = 'Pending';
    comment.read = ['staff', 'sysadmin'];
    break;
  case 'Deferred':
    defaultLog.info('Deferring Comment');
    comment.eaoStatus = 'Deferred';
    comment.read = ['staff', 'sysadmin'];
    break;
  case 'Rejected':
    defaultLog.info('Rejecting Comment');
    comment.eaoStatus = 'Rejected';
    comment.read = ['staff', 'sysadmin'];
    break;
  case 'Reset':
    defaultLog.info('Resetting Comment Status');
    comment.eaoStatus = 'Pending';
    comment.read = ['staff', 'sysadmin'];
    break;
  default:
    break;
  }
  return comment;
};


exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.publicHead = async function (args, res) {
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  // Build match query if on CommentPeriodId route
  var query = {};
  if (args.swagger.params.period && args.swagger.params.period.value) {
    query = Utils.buildQuery('period', args.swagger.params.period.value, query);
  }

  const fields = getSanitizedFields(args.swagger.params.fields.value);

  // Set query type
  _.assignIn(query, { '_schemaName': 'Comment' });

  var data = await Utils.runDataQuery('Comment',
    ['public'],
    query,
    fields, // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    true); // count
  Utils.recordAction('Head', 'CommentPeriod', 'public');
  // /api/comment/ route, return 200 OK with 0 items if necessary
  if (!(args.swagger.params.period && args.swagger.params.period.value) || (data && data.length > 0)) {
    res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
    return Actions.sendResponse(res, 200, data);
  }
};

exports.publicGet = async function (args, res) {
  var query = {}, sort = {};
  var skip = null, limit = null;

  // Build match query if on commentId route.
  if (args.swagger.params.commentId && args.swagger.params.commentId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.commentId.value, query);
  } else {
    if (args.swagger.params.period && args.swagger.params.period.value) {
      query = Utils.buildQuery('period', args.swagger.params.period.value, query);
    }
    // Sort
    if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
      args.swagger.params.sortBy.value.forEach(function (value) {
        var order_by = value.charAt(0) == '-' ? -1 : 1;
        var sort_by = value.slice(1);
        sort[sort_by] = order_by;
      }, this);
    }

    var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
    skip = processedParameters.skip;
    limit = processedParameters.limit;
  }

  const fields = getSanitizedFields(args.swagger.params.fields.value);
  // Set query type
  _.assignIn(query, { '_schemaName': 'Comment' });

  var data = await Utils.runDataQuery('Comment',
    ['public'],
    query,
    fields, // Fields
    null,
    sort, // sort
    skip, // skip
    limit, // limit
    true); // count

  if (data[0] == null) {
    if (args.swagger.params.count.value) {
      res.setHeader('x-total-count', 0);
    }
    return Actions.sendResponse(res, 200, data);
  }

  _.each(data[0].results, function (item) {
    if (item.isAnonymous === true) {
      delete item.author;
    }
  });
  if (args.swagger.params.count.value) {
    Utils.recordAction('Get', 'Comment', 'public', args.swagger.params.commentId && args.swagger.params.commentId.value ? args.swagger.params.commentId.value : null);
    res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
    return Actions.sendResponse(res, 200, data.length !== 0 ? data[0].results : []);
  } else {
    return Actions.sendResponse(res, 200, data);
  }
};

exports.protectedHead = async function (args, res) {
  var query = {};

  if (args.swagger.params.commentId && args.swagger.params.commentId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.commentId.value, query);
  }
  if (args.swagger.params._commentPeriod && args.swagger.params._commentPeriod.value) {
    query = Utils.buildQuery('_commentPeriod', args.swagger.params._commentPeriod.value, query);
  }
  // Unless they specifically ask for it, hide deleted results.
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value != undefined) {
    _.assignIn(query, { isDeleted: args.swagger.params.isDeleted.value });
  }

  // Set query type
  _.assignIn(query, { '_schemaName': 'Comment' });

  var data = await Utils.runDataQuery('Comment',
    args.swagger.operation['x-security-scopes'],
    query,
    ['_id',
      'tags'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    true); // count
  Utils.recordAction('Head', 'Comment', args.swagger.params.auth_payload.preferred_username, args.swagger.params.commentId && args.swagger.params.commentId.value ? args.swagger.params.commentId.value : null);
  // /api/comment/ route, return 200 OK with 0 items if necessary
  if (!(args.swagger.params.commentId && args.swagger.params.commentId.value) || (data && data.length > 0)) {
    res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
    return Actions.sendResponse(res, 200, data);
  } else {
    return Actions.sendResponse(res, 404, data);
  }
};

exports.protectedGet = async function (args, res) {
  defaultLog.info('Getting comment(s)');

  var query = {}, sort = {}, skip = null, limit = null, count = false, filter = [];

  // Build match query if on commentId route.
  if (args.swagger.params.commentId && args.swagger.params.commentId.value) {
    _.assignIn(query, { _id: mongoose.Types.ObjectId(args.swagger.params.commentId.value) });
  }

  // Build match query if on comment period's id
  if (args.swagger.params.period && args.swagger.params.period.value) {
    _.assignIn(query, { period: mongoose.Types.ObjectId(args.swagger.params.period.value) });
  }

  // Sort
  if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
    args.swagger.params.sortBy.value.forEach(function (value) {
      var order_by = value.charAt(0) == '-' ? -1 : 1;
      var sort_by = value.slice(1);
      sort[sort_by] = order_by;
    }, this);
  }

  // Skip and limit
  var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
  skip = processedParameters.skip;
  limit = processedParameters.limit;

  // Count
  if (args.swagger.params.count && args.swagger.params.count.value) {
    count = args.swagger.params.count.value;
  }

  // Set query type
  _.assignIn(query, { '_schemaName': 'Comment' });

  // Set filter for eaoStatus
  if (args.swagger.params.pending && args.swagger.params.pending.value === true) {
    filter.push({ 'eaoStatus': 'Pending' });
  }
  if (args.swagger.params.published && args.swagger.params.published.value === true) {
    filter.push({ 'eaoStatus': 'Published' });
  }
  if (args.swagger.params.deferred && args.swagger.params.deferred.value === true) {
    filter.push({ 'eaoStatus': 'Deferred' });
  }
  if (args.swagger.params.rejected && args.swagger.params.rejected.value === true) {
    filter.push({ 'eaoStatus': 'Rejected' });
  }
  if (filter.length !== 0) {
    _.assignIn(query, { $or: filter });
  }

  try {
    var data = await Utils.runDataQuery('Comment',
      args.swagger.params.auth_payload.realm_access.roles,
      query,
      getSanitizedFields(args.swagger.params.fields.value), // Fields
      null,
      sort, // sort
      skip, // skip
      limit, // limit
      count); // count
    Utils.recordAction('Get', 'Comment', args.swagger.params.auth_payload.preferred_username, args.swagger.params.commentId && args.swagger.params.commentId.value ? args.swagger.params.commentId.value : null);
    defaultLog.info('Got comment(s):', data);

    // This is to get the next pending comment information.
    if (args.swagger.params.populateNextComment && args.swagger.params.populateNextComment.value) {
      defaultLog.info('Getting next pending comment information');
      var queryForNextComment = {};

      _.assignIn(queryForNextComment, { _id: { $ne: data[0]._id } });
      _.assignIn(queryForNextComment, { period: data[0].period });
      _.assignIn(queryForNextComment, { eaoStatus: 'Pending' });

      var nextComment = await Utils.runDataQuery('Comment',
        args.swagger.params.auth_payload.realm_access.roles,
        queryForNextComment,
        [], // Fields
        null,
        { commentId: 1 }, // sort
        0, // skip
        1, // limit
        true); // count
      res.setHeader('x-pending-comment-count', nextComment && nextComment.length > 0 ? nextComment[0].total_items : 0);
      res.setHeader('x-next-comment-id', nextComment && nextComment.length > 0 && nextComment[0].results.length > 0 ? nextComment[0].results[0]._id : null);
    }
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

//  Create a new Comment
exports.protectedPost = async function (args, res) {
  var obj = args.swagger.params.comment.value;

  defaultLog.info('Incoming new comment:', obj);

  var Comment = mongoose.model('Comment');

  var vcs = [];
  obj.valuedComponents.forEach(function (vc) {
    vcs.push(mongoose.Types.ObjectId(vc));
  });

  var docs = [];
  obj.documents.forEach(function (doc) {
    docs.push(mongoose.Types.ObjectId(doc));
  });

  // get the next commentID for this period
  var commentIdCount = await getNextCommentIdCount(mongoose.Types.ObjectId(obj.period));

  var comment = new Comment();
  comment._schemaName = 'Comment';
  comment.author = obj.author;
  comment.comment = obj.comment;
  comment.dateAdded = obj.dateAdded;
  comment.dateUpdated = obj.dateUpdated;
  comment.documents = docs;
  comment.eaoNotes = obj.eaoNotes;
  comment.eaoStatus = obj.eaoStatus;
  comment.isAnonymous = obj.isAnonymous;
  comment.location = obj.location;
  comment.period = mongoose.Types.ObjectId(obj.period);
  comment.proponentNotes = obj.proponentNotes;
  comment.proponentStatus = obj.proponentStatus;
  comment.publishedNotes = obj.publishedNotes;
  comment.rejectedNotes = obj.rejectedNotes;
  comment.rejectedReason = obj.rejectedReason;
  comment.valuedComponents = vcs;
  comment.commentId = commentIdCount;
  comment.datePosted = obj.eaoStatus == 'Published' ? obj.datePosted : undefined;
  comment.write = ['staff', 'sysadmin'];
  comment.delete = ['staff', 'sysadmin'];

  comment = setPermissionsFromEaoStatus(obj.eaoStatus, comment);

  try {
    var c = await comment.save();
    Utils.recordAction('Post', 'Comment', args.swagger.params.auth_payload.preferred_username, c._id);
    defaultLog.info('Saved new comment object:', c);
    return Actions.sendResponse(res, 200, c);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

async function getNextCommentIdCount(period) {
  var CommentPeriod = mongoose.model('CommentPeriod');
  var periodUpdated = await CommentPeriod.findOneAndUpdate({ _id: period }, { $inc: { commentIdCount: 1 } }, { new: true });
  return periodUpdated.commentIdCount;
}

//  Create a new Comment
exports.unProtectedPost = async function (args, res) {
  try {
    const obj = args.swagger.params.comment.value;
    defaultLog.info('Incoming new object:', obj);

    const Comment = mongoose.model('Comment');

    // Ensure the comment is received before the end date of the period.
    const commentPeriodModel = mongoose.model('CommentPeriod');
    const period = await commentPeriodModel.findOne({ _id: obj.period });
    if (moment().diff(moment(period.dateCompleted)) > 0) {
      // Past the specified time
      const endDate = moment(period.dateCompleted).format('MMM DD, YYYY h:mm A');
      defaultLog.info('Comment was not received before completed date:', endDate);
      return Actions.sendResponse(res,
        400, {
          code: '400',
          message: 'Comment recieved after date completed'
        }
      );
    }

    // get the next commentID for this period
    const commentIdCount = await getNextCommentIdCount(mongoose.Types.ObjectId(obj.period));

    let comment = new Comment(obj);
    comment._schemaName = 'Comment';
    comment.eaoStatus = 'Pending';
    comment.author = obj.author;
    comment.comment = obj.comment;
    comment.dateAdded = new Date();
    comment.dateUpdated = new Date();
    comment.isAnonymous = obj.isAnonymous;
    comment.location = obj.location;
    comment.period = mongoose.Types.ObjectId(obj.period);
    comment.commentId = commentIdCount;
    comment.documents = [];
    comment.datePosted = undefined;
    comment.submittedCAC = obj.submittedCAC;

    comment.read = ['staff', 'sysadmin'];
    comment.write = ['staff', 'sysadmin'];
    comment.delete = ['staff', 'sysadmin'];

    const c = await comment.save();
    Utils.recordAction('Post', 'Comment', 'public', c._id);
    defaultLog.info('Saved new comment object:', c);
    return Actions.sendResponse(res, 200, c);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing Comment
exports.protectedPut = async function (args, res) {
  var objId = args.swagger.params.commentId.value;
  var obj = args.swagger.params.comment.value;
  defaultLog.info('Put comment:', objId);

  var Comment = mongoose.model('Comment');

  var vcs = [];
  obj.valuedComponents.forEach(function (vc) {
    vcs.push(mongoose.Types.ObjectId(vc));
  });

  var comment = {
    isAnonymous: obj.isAnonymous,
    datePosted: obj.datePosted,
    dateUpdated: new Date(),
    eaoNotes: obj.eaoNotes,
    eaoStatus: obj.eaoStatus,
    submittedCAC: obj.submittedCAC,
    proponentNotes: obj.proponentNotes,
    proponentStatus: obj.proponentStatus,
    publishedNotes: obj.publishedNotes,
    rejectedNotes: obj.rejectedNotes,
    rejectedReason: obj.rejectedReason,
    valuedComponents: vcs,
    // TODO
    // documents: obj.documents,
  };
  comment = setPermissionsFromEaoStatus(obj.eaoStatus, comment);

  defaultLog.info('Incoming updated object:', comment);

  try {
    var c = await Comment.update({ _id: objId }, { $set: comment });
    Utils.recordAction('Put', 'Comment', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Comment updated:', c);
    return Actions.sendResponse(res, 200, c);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

// Publish the Comment
exports.protectedStatus = async function (args, res) {
  var objId = args.swagger.params.commentId.value;
  var status = args.swagger.params.status.value.status;

  var comment = {
    dateUpdated: new Date(),
    updatedBy: args.swagger.params.auth_payload.preferred_username
  };
  var Comment = mongoose.model('Comment');

  comment = setPermissionsFromEaoStatus(status, comment);

  try {
    var c = await Comment.update({ _id: objId }, { $set: comment });
    Utils.recordAction('Status', 'Comment', args.swagger.params.auth_payload.preferred_username, objId);
    defaultLog.info('Comment updated:', c);
    return Actions.sendResponse(res, 200, c);
  } catch (e) {
    defaultLog.info('Error:', e);
    return Actions.sendResponse(res, 400, e);
  }
};

function formatDate(date) {
  if (date){
    var d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  } else {
    return null;
  }
}

// Export all comments
exports.protectedExport = async function (args, res) {
  var period = args.swagger.params.periodId.value;
  var format = args.swagger.params.format.value;
  var roles = args.swagger.params.auth_payload.realm_access.roles;

  var documentModel = mongoose.model('Document');

  // get api's base path
  var basePath = Utils.getBasePath(args.protocol, args.host);

  // get period title
  var commentPeriodModel = mongoose.model('CommentPeriod');
  var commentPeriod = await commentPeriodModel.findOne({ _id: period });
  var commentPeriodName = commentPeriod.instructions;

  // get project name
  var projectModel = mongoose.model('Project');
  var project = await projectModel.findOne({ _id: commentPeriod.project });
  var projectName = project.name;

  var exportDate = formatDate(new Date());

  var match = {
    _schemaName: 'Comment',
    period: mongoose.Types.ObjectId(period)
  };

  var aggregation = [
    {
      $match: match
    }
  ];

  aggregation.push({
    $redact: {
      $cond: {
        if: {
          // This way, if read isn't present, we assume public no roles array.
          $and: [
            { $cond: { if: '$read', then: true, else: false } },
            {
              $anyElementTrue: {
                $map: {
                  input: '$read',
                  as: 'fieldTag',
                  in: { $setIsSubset: [['$$fieldTag'], roles] }
                }
              }
            }
          ]
        },
        then: '$$KEEP',
        else: {
          $cond: { if: '$read', then: '$$PRUNE', else: '$$DESCEND' }
        }
      }
    }
  });

  var data = await mongoose.model('Comment').aggregate(aggregation);

  const filename = 'export.csv';
  res.setHeader('Content-disposition', `attachment; filename=${filename}`);
  res.writeHead(200, { 'Content-Type': 'text/csv' });

  res.flushHeaders();

  var csv = require('csv');
  const transform = require('stream-transform');

  // if exporting for proponent, prune rejected documents for each comment
  // must be outside of the transform below due to database calls
  if (format == 'proponent') {

    // todo: translate valuedComponents

    for (let c=0; c<data.length; c++){
      if (data[c].documents && data[c].documents.length > 0) {
        for (let i=0; i<data[c].documents.length; i++){
          var doc = await documentModel.findOne({ _id : data[c].documents[i] });

          if (doc.eaoStatus !== 'Published'){
            delete data[c].documents[i];
          }
        }
      }
    }
  }

  transform(data, function (d) {

    // Translate documents into links.
    let docLinks = [];

    if (d.documents && d.documents.length > 0) {
      d.documents.map((theDoc) => {
        docLinks.push(basePath + '/api/document/' + theDoc + '/fetch');
      });
    }

    //Remove anonymous users
    let sanitizedAuthor = 'Anonymous';
    if (!d.isAnonymous) {
      sanitizedAuthor = d.author;
    }

    // Populate csv with fields relevant to staff
    if (format == 'staff'){

      return {
        Comment_No: d.commentId,
        Submitted: formatDate(d.dateAdded),
        Author: sanitizedAuthor,
        Location: d.location,
        Comment: d.comment,
        Attachments: docLinks,
        Published: formatDate(d.datePosted),
        Status: d.eaoStatus,
        Rejected_Reason: d.rejectedReason,
        Rejected_Notes: d.rejectedNotes,
        EAO_Notes: d.eaoNotes,
        Project: projectName,
        PCP_Title: commentPeriodName,
        Export_Date: exportDate,
        CACMember: d.submittedCAC
      };

      // Populate csv with fields relevant to proponents
    } else if (format == 'proponent') {
      let read = d.read;
      if (read.includes('public')) {

        return {
          Comment_No: d.commentId,
          Submitted: formatDate(d.dateAdded),
          Author: sanitizedAuthor,
          Location: d.location,
          Comment: d.comment,
          Attachments: docLinks,
          Published: formatDate(d.datePosted),
          Pillar: d.pillars,
          Project: projectName,
          PCP_Title: commentPeriodName,
          Export_Date: exportDate,
          CACMember: d.submittedCAC
        };
      } else {
        return null;
      }
    }
  })
    .pipe(csv.stringify({ header: true }))
    .pipe(res);
};