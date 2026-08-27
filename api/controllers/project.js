var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var qs = require('qs');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var demiPush = require('../helpers/demiPush');
var tagList = [
  'CEAAInvolvement',
  'CELead',
  'CELeadEmail',
  'CELeadPhone',
  'centroid',
  'description',
  'eacDecision',
  'activeStatus',
  'location',
  'name',
  'projectLeadId',
  'projectLead',
  'projectLeadEmail',
  'projectLeadPhone',
  'proponent',
  'region',
  'responsibleEPDId',
  'responsibleEPD',
  'responsibleEPDEmail',
  'responsibleEPDPhone',
  'subtype',
  'type',
  'legislation',
  'addedBy',
  'build',
  'intake',
  'CEAALink',
  'code',
  'eaDecision',
  'operational',
  'substantiallyStarted',
  'nature',
  'commodity',
  'currentPhaseName',
  'phaseHistory',
  'dateAdded',
  'dateCommentsClosed',
  'dateCommentsOpen',
  'dateUpdated',
  'decisionDate',
  'duration',
  'eaoMember',
  'epicProjectID',
  'fedElecDist',
  'isTermsAgreed',
  'overallProgress',
  'primaryContact',
  'proMember',
  'provElecDist',
  'sector',
  'shortName',
  'status',
  'substantiallyDate',
  'substantially',
  'substitution',
  'eaStatus',
  'eaStatusDate',
  'projectStatusDate',
  'activeDate',
  'updatedBy',
  'projLead',
  'execProjectDirector',
  'complianceLead',
  'featuredDocuments',
  'review180Start',
  'review45Start',
  'reviewSuspensions',
  'reviewExtensions',
  'hasMetCommentPeriods',
  'cacMembers',
  'cacEmail',
  'projectCAC',
  'projectCACPublished',
  'read',
  'write',
  'delete'
];

const WORDS_TO_ANALYZE = 3;



exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.publicHead = async function (args, res) {
  defaultLog.info('Getting head for Project');

  // Build match query if on ProjId route
  var query = {};
  var commentPeriodPipeline = null;

  // Add in the default fields to the projection so that the incoming query will work for any selected fields.
  tagList.push('dateAdded');
  tagList.push('dateCompleted');

  var requestedFields = Utils.sanitizeFields(args.swagger.params.fields.value, tagList);

  if (args.swagger.params.projId && args.swagger.params.projId.value) {
    if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      return Actions.sendResponse(res, 400, { });
    }
    query = Utils.buildQuery('_id', args.swagger.params.projId.value, query);
    commentPeriodPipeline = handleCommentPeriodForBannerQueryParameters(args, args.swagger.params.projId.value);
  } else {
    try {
      query = addStandardQueryFilters(query, args);
    } catch (error) {
      return Actions.sendResponse(res, 400, { error: error.message });
    }
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Project' });

  try {
    var data = await Utils.runDataQuery('Project',
      ['public'],
      query,
      requestedFields, // Fields
      null, // sort warmup
      null, // sort
      null, // skip
      0, // limit - HEAD only needs count, not data
      true, // count
      null,
      false,
      commentPeriodPipeline);
    // /api/comment/ route, return 200 OK with 0 items if necessary
    if (!(args.swagger.params.projId && args.swagger.params.projId.value) || (data && data.length > 0)) {
      Utils.recordAction('Head', 'Project', 'public', args.swagger.params.projId && args.swagger.params.projId.value ? args.swagger.params.projId.value : null);
      defaultLog.info('Got project head:', data);
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

exports.publicGet = async function (args, res) {
  // Build match query if on projId route
  var query = {}, skip = null, limit = null;
  var commentPeriodPipeline = null;
  let review180start = args.swagger.params.fields.value;
  if (review180start) {
    review180start.push('review180Start');
  }
  var requestedFields = Utils.sanitizeFields(review180start, tagList);
  // Add in the default fields to the projection so that the incoming query will work for any selected fields.
  tagList.push('dateAdded');
  tagList.push('dateCompleted');


  if (args.swagger.params.projId && args.swagger.params.projId.value) {
    if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      return Actions.sendResponse(res, 400, { });
    }
    query = Utils.buildQuery('_id', args.swagger.params.projId.value, query);
    commentPeriodPipeline = handleCommentPeriodForBannerQueryParameters(args, args.swagger.params.projId.value);
  } else {
    // Could be a bunch of results - enable pagination
    var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
    skip = processedParameters.skip;
    limit = processedParameters.limit;

    try {
      query = addStandardQueryFilters(query, args);
    } catch (error) {
      return Actions.sendResponse(res, 400, { error: error.message });
    }
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Project' });

  try {
    var data = await Utils.runDataQuery('Project',
      ['public'],
      query,
      requestedFields, // Fields
      null, // sort warmup
      null, // sort
      skip, // skip
      limit, // limit
      false, // count
      null, // steps
      true, // proponent populate
      commentPeriodPipeline);
    defaultLog.info('Got project(s):', data);

    // TODO: We should do this as a query
    if (commentPeriodPipeline) {
      data.forEach(function (item) {
        if (item.commentPeriodForBanner.length > 0 && !item.commentPeriodForBanner[0].read.includes('public')) {
          delete item.commentPeriodForBanner;
        }
      });
    }
    serializeProjectVirtuals(data);
    Utils.recordAction('Get', 'Project', 'public', args.swagger.params.projId && args.swagger.params.projId.value ? args.swagger.params.projId.value : null);
    // Sanitize for public.
    let sanitizedData = Utils.filterData('Project', data, ['public']);

    defaultLog.debug('publicGet sanitized response: %j', sanitizedData);
    return Actions.sendResponse(res, 200, sanitizedData);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedGet = async function (args, res) {
  var skip = null, limit = null, sort = null;
  var count = false;
  var query = {};

  var commentPeriodPipeline = null;

  // Admin's only get this
  if (args.swagger.params.fields.value) {
    args.swagger.params.fields.value.push('directoryStructure');
  }
  var fields = Utils.sanitizeFields(args.swagger.params.fields.value, tagList);

  tagList.push('dateStarted');
  tagList.push('dateCompleted');

  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  if (args.swagger.params.projId && args.swagger.params.projId.value) {
    if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      return Actions.sendResponse(res, 400, {});
    }
    // Getting a single project
    Object.assign(query, { _id: new mongoose.Types.ObjectId(args.swagger.params.projId.value) });
    commentPeriodPipeline = handleCommentPeriodForBannerQueryParameters(args, args.swagger.params.projId.value);
    defaultLog.debug('protectedGet commentPeriodPipeline: %j', commentPeriodPipeline);
  } else {
    // Getting multiple projects
    try {
      // Filters
      query = addStandardQueryFilters(query, args);

      // Sorting
      if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
        sort = {};
        args.swagger.params.sortBy.value.forEach(function (value) {
          var order_by = value.charAt(0) == '-' ? -1 : 1;
          var sort_by = value.slice(1);
          sort[sort_by] = order_by;
        }, this);
      }

      // Pagination
      var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
      skip = processedParameters.skip;
      limit = processedParameters.limit;

      // Enable Count
      count = true;

    } catch (error) {
      return Actions.sendResponse(res, 400, { error: error.message });
    }
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Project' });

  defaultLog.debug('protectedGet query: %j pipeline: %j', query, commentPeriodPipeline);

  try {
    var data = await Utils.runDataQuery('Project',
      args.swagger.params.auth_payload.realm_access.roles,
      query,
      fields, // Fields
      null, // sort warmup
      sort, // sort
      skip, // skip
      limit, // limit
      count, // count
      null,
      true,
      commentPeriodPipeline);
    Utils.recordAction('Get', 'Project', args.swagger.params.auth_payload.preferred_username, args.swagger.params.projId && args.swagger.params.projId.value ? args.swagger.params.projId.value : null);
    serializeProjectVirtuals(data);

    defaultLog.info('Got comment project(s):', data);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedHead = function (args, res) {
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  // Build match query if on projId route
  var query = {};

  // Add in the default fields to the projection so that the incoming query will work for any selected fields.
  tagList.push('_id');
  tagList.push('tags');

  if (args.swagger.params.projId && args.swagger.params.projId.value) {
    if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      return Actions.sendResponse(res, 400, { });
    }
    query = Utils.buildQuery('_id', args.swagger.params.projId.value, query);
  } else {
    try {
      query = addStandardQueryFilters(query, args);
    } catch (error) {
      return Actions.sendResponse(res, 400, { error: error.message });
    }
  }

  // Unless they specifically ask for it, hide deleted results.
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value !== undefined) {
    Object.assign(query, { isDeleted: args.swagger.params.isDeleted.value });
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Project' });

  Utils.runDataQuery('Project',
    args.swagger.operation['x-security-scopes'],
    query,
    tagList, // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    0, // limit - HEAD only needs count, not data
    true) // count
    .then(function (data) {
      // /api/comment/ route, return 200 OK with 0 items if necessary
      if (!(args.swagger.params.projId && args.swagger.params.projId.value) || (data && data.length > 0)) {
        Utils.recordAction('Head', 'Project', args.swagger.params.auth_payload.preferred_username, args.swagger.params.projId && args.swagger.params.projId.value ? args.swagger.params.projId.value : null);
        res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
        return Actions.sendResponse(res, 200, data);
      } else {
        return Actions.sendResponse(res, 404, data);
      }
    });
};

exports.protectedDelete = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  defaultLog.info('Delete Project:', projId);

  if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
    return Actions.sendResponse(res, 400, { });
  }

  var Project = mongoose.model('Project');
  try {
    const o = await Project.findOne({ _id: projId });
    if (o) {
      defaultLog.info('o:', o);

      // Set the deleted flag.
      try {
        const deleted = await Actions.delete(o);
        Utils.recordAction('Delete', 'Project', args.swagger.params.auth_payload.preferred_username, projId);
        // Deleted successfully
        return Actions.sendResponse(res, 200, deleted);
      } catch (err) {
        // Error
        return Actions.sendResponse(res, 400, err);
      }
    } else {
      defaultLog.info('Couldn\'t find that object!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (err) {
    return Actions.sendResponse(res, 500, err);
  }
};



//  Create a new project
exports.protectedPost = async function (args, res) {
  var obj = args.swagger.params.project.value;

  // default project creation is set to 2002 right now for backwards compatibility with other apps that use this api
  var projectLegislationYear = obj.legislationYear ? obj.legislationYear : 2002;

  defaultLog.info('Incoming new object:', obj);

  var Project = mongoose.model('Project');
  var project;
  var projectData;

  if (projectLegislationYear == 2018) {
    project = new Project({ legislation_2018: obj });
    projectData = project.legislation_2018;
    projectData.legislation = '2018 Environmental Assessment Act';
  } else if (projectLegislationYear == 2002) {
    project = new Project({ legislation_2002: obj });
    projectData = project.legislation_2002;
    projectData.legislation = '2002 Environmental Assessment Act';
  } else if (projectLegislationYear == 1996) {
    project = new Project({ legislation_1996: obj });
    projectData = project.legislation_1996;
    projectData.legislation = '1996 Environmental Assessment Act';
  }

  if (!project) {
    defaultLog.info('Couldn\'t find that project object!');
    return Actions.sendResponse(res, 400, 'Error loading project data');
  }

  //Need to add this logic to the put because we will only hit a post on a net new project
  project.currentLegislationYear = 'legislation_' + projectLegislationYear;
  project.legislationYearList.push(projectLegislationYear);

  if (!mongoose.Types.ObjectId.isValid(obj.proponent)
      || !mongoose.Types.ObjectId.isValid(obj.responsibleEPDId)
      || !mongoose.Types.ObjectId.isValid(obj.projectLeadId)) {
    return Actions.sendResponse(res, 400, {});
  }

  projectData.proponent = new mongoose.Types.ObjectId(obj.proponent);
  projectData.responsibleEPDId = new mongoose.Types.ObjectId(obj.responsibleEPDId);
  projectData.projectLeadId = new mongoose.Types.ObjectId(obj.projectLeadId);

  // Also need to make sure that the eacDecision and CEAAInvolvement fields are in the project. Hard requirement for public
  projectData.CEAAInvolvement = obj.CEAAInvolvement ? obj.CEAAInvolvement : null;
  projectData.eacDecision = obj.eacDecision ? obj.eacDecision : null;

  projectData.status = '';
  if (obj.currentPhaseName) {
    const ListModel = mongoose.model('List');
    const phaseListDoc = await ListModel.findById(obj.currentPhaseName);
    if (phaseListDoc) {
      projectData.status = phaseListDoc.name;
    }
  }

  // Generate search terms for the name.
  projectData.nameSearchTerms = Utils.generateSearchTerms(obj.name, WORDS_TO_ANALYZE);

  // Define security tag defaults
  project.read = ['sysadmin', 'staff'];
  project.write = ['sysadmin', 'staff'];
  project.delete = ['sysadmin', 'staff'];
  projectData._createdBy = args.swagger.params.auth_payload.preferred_username;
  projectData.createdDate = Date.now();

  if (projectLegislationYear == 2018) {
    project.legislation_2018 = projectData;
  } else if (projectLegislationYear == 2002) {
    project.legislation_2002 = projectData;
  } else if (projectLegislationYear == 1996) {
    project.legislation_1996 = projectData;
  }

  // Currently this will save based on the entire project model.
  // Meaning there will be three project legislation keys ( legislation_1996, legislation_2002, legislation_2018) only one of which will be populated with data.
  // The other two keys will be full of null values, as well as any other fields that are in the project model and are not explicitly defined above.
  project.save()
    .then(function (theProject) {
      Utils.recordAction('Post', 'Project', args.swagger.params.auth_payload.preferred_username, theProject._id);
      demiPush.project(theProject);
      return Actions.sendResponse(res, 200, theProject);
    })
    .catch(function (err) {
      defaultLog.error('Error saving project:', err);
      return Actions.sendResponse(res, 400, err);
    });
};



exports.protectedExtensionAdd = async function (args, res) {
  // Adds an object to the extension/suspension array
  var projId = args.swagger.params.projId.value;
  var extensionObj = args.swagger.params.extension.value;
  var extensionType = extensionObj.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, { });
  }

  var Project = mongoose.model('Project');
  try {
    var data = await Project.updateOne(
      { _id: projId },
      { $push: { [extensionType]: extensionObj } }
    );
    if (data.modifiedCount === 0) {
      return Actions.sendResponse(res, 404, {});
    }
    // Fall through if successful
    Utils.recordAction('Post', 'Extension', args.swagger.params.auth_payload.preferred_username, projId);
    const fresh = await Project.findById(projId).catch(() => null);
    demiPush.project(fresh);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.info('Couldn\'t find that object!');
    return Actions.sendResponse(res, 404, {});
  }
};

exports.protectedExtensionDelete = async function (args, res) {
  // Delete an object from the extension/suspension array
  try {
    var projId = args.swagger.params.projId.value;
    if (!mongoose.Types.ObjectId.isValid(projId)) {
      return Actions.sendResponse(res, 400, { });
    }
    var extensionObj = JSON.parse(args.swagger.params.item.value);
    var extensionType = extensionObj.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

    var Project = mongoose.model('Project');
    var data = await Project.updateOne(
      { _id: projId },
      { $pull: { [extensionType]: extensionObj } }
    );
    if (data.modifiedCount === 0) {
      return Actions.sendResponse(res, 404, {});
    }
    // Fall through if successful
    Utils.recordAction('Delete', 'Extension', args.swagger.params.auth_payload.preferred_username, projId);
    const fresh = await Project.findById(projId).catch(() => null);
    demiPush.project(fresh);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.info('Couldn\'t find that object!');
    return Actions.sendResponse(res, 404, {});
  }
};

exports.protectedExtensionUpdate = async function (args, res) {
  // Edit an object to the extension/suspension array
  // NB: We need both the old and the new in order to update accordingly
  var projId = args.swagger.params.projId.value;
  if (!mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var extensionObj = args.swagger.params.extension.value;
  var extensionNew = extensionObj.new;
  var extensionOld = extensionObj.old;
  var extensionOldType = extensionOld.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';
  var extensionNewType = extensionNew.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

  var Project = mongoose.model('Project');
  try {
    let dataRemoved = await Project.updateOne(
      { _id: projId },
      { $pull: { [extensionOldType]: extensionOld } }
    );
    if (dataRemoved.modifiedCount === 0) {
      return Actions.sendResponse(res, 404, {});
    }
    // Fall through if successful
    var dataAdded = await Project.updateOne(
      { _id: projId },
      { $push: { [extensionNewType]: extensionNew } }
    );
    if (dataAdded.modifiedCount === 0) {
      return Actions.sendResponse(res, 404, {});
    }
    Utils.recordAction('Put', 'Extension', args.swagger.params.auth_payload.preferred_username, projId);
    const fresh = await Project.findById(projId).catch(() => null);
    demiPush.project(fresh);
    return Actions.sendResponse(res, 200, dataAdded);
  } catch (e) {
    defaultLog.info('Couldn\'t find that object!');
    return Actions.sendResponse(res, 404, {});
  }
};









// Update an existing project
exports.protectedPut = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  defaultLog.info('ObjectID:', args.swagger.params.projId.value);

  var Project = mongoose.model('Project');
  var projectObj = args.swagger.params.ProjObject.value;

  // get full project object to retain existing data
  var fullProjectObject = await Project.findById(new mongoose.Types.ObjectId(objId));

  var projectLegislationYear;
  var filteredData;

  // if project legislation doesn't exist then look up current legislation for the project
  if (projectObj.legislationYear) {
    projectLegislationYear = projectObj.legislationYear;
    // check if the passed in project year exists in the legislation year list
    if (!fullProjectObject.legislationYearList.includes(projectLegislationYear)) {
      fullProjectObject.legislationYearList.push(projectLegislationYear);
    }
  } else {
    // look up the current project legislation
    projectLegislationYear = fullProjectObject.currentLegislationYear.split('_')[1];
  }

  if (projectLegislationYear == 2018) {
    filteredData = fullProjectObject.legislation_2018;
    filteredData.legislation = '2018 Environmental Assessment Act';
  } else if (projectLegislationYear == 2002) {
    filteredData = fullProjectObject.legislation_2002;
    filteredData.legislation = '2002 Environmental Assessment Act';
  } else if (projectLegislationYear == 1996) {
    filteredData = fullProjectObject.legislation_1996;
    filteredData.legislation = '1996 Environmental Assessment Act';
  }

  if (!filteredData) {
    defaultLog.info('Couldn\'t find that object!');
    return Actions.sendResponse(res, 404, {});
  }
  defaultLog.debug('protectedPut updating project: %s', objId);

  delete projectObj.read;
  delete projectObj.write;
  delete projectObj.delete;

  filteredData.type = projectObj.type;
  filteredData.build = projectObj.build;
  filteredData.sector = projectObj.sector;
  filteredData.description = projectObj.description;
  filteredData.location = projectObj.location;
  filteredData.region = projectObj.region;
  filteredData.status = '';
  if (projectObj.currentPhaseName) {
    const ListModel = mongoose.model('List');
    const phaseListDoc = await ListModel.findById(projectObj.currentPhaseName);
    if (phaseListDoc) {
      filteredData.status = phaseListDoc.name;
    }
  }
  filteredData.eaStatus = projectObj.eaStatus;
  filteredData.name = projectObj.name;
  filteredData.substantiallyDate = projectObj.substantiallyDate;
  filteredData.eaStatusDate = projectObj.eaStatusDate;
  //Updating the legislation Year in the legislation key
  filteredData.legislationYear = projectLegislationYear;

  // obj.eaStatusDate = projectObj.eaStatusDate ? new Date(projectObj.eaStatusDate) : null;
  // obj.projectStatusDate = projectObj.projectStatusDate ? new Date(projectObj.projectStatusDate) : null;
  // obj.substantiallyDate = projectObj.substantiallyDate ? new Date(projectObj.substantiallyDate) : null;
  // obj.activeDate = projectObj.activeDate ? new Date(projectObj.activeDate) : null;

  filteredData.substantially = projectObj.substantially;
  filteredData.dispute = projectObj.dispute;
  filteredData.disputeDate = projectObj.disputeDate;

  filteredData.centroid = projectObj.centroid;

  // Contacts
  filteredData.projectLeadId = new mongoose.Types.ObjectId(projectObj.projectLeadId);
  filteredData.responsibleEPDId = new mongoose.Types.ObjectId(projectObj.responsibleEPDId);

  filteredData.CEAAInvolvement = projectObj.CEAAInvolvement;
  filteredData.CEAALink = projectObj.CEAALink;
  filteredData.eacDecision = projectObj.eacDecision;
  filteredData.decisionDate = projectObj.decisionDate ? new Date(projectObj.decisionDate) : null;
  fullProjectObject.review45Start = projectObj.review45Start ? new Date(projectObj.review45Start) : null;
  fullProjectObject.review180Start = projectObj.review180Start ? new Date(projectObj.review180Start) : null;

  filteredData.nameSearchTerms = Utils.generateSearchTerms(projectObj.name, WORDS_TO_ANALYZE);

  try {
    filteredData.intake = {};
    filteredData.intake.investment = projectObj.intake.investment;
    filteredData.intake.investmentNotes = projectObj.intake.notes;
  } catch (e) {
    // Missing info
    defaultLog.warn('protectedPut missing intake data for project %s: %s', objId, e.message);
    // fall through
  }
  filteredData.proponent = projectObj.proponent;
  filteredData.currentPhaseName = projectObj.currentPhaseName;

  //If phaseHistory isn't initialized (defaults to empty string)
  if (filteredData.phaseHistory === '') {
    filteredData.phaseHistory = [];
    filteredData.phaseHistory.push(filteredData.currentPhaseName);
  } else if (filteredData.phaseHistory !== null && JSON.stringify(filteredData.phaseHistory[filteredData.phaseHistory.length - 1]) !== JSON.stringify(filteredData.currentPhaseName)) {
    // To avoid updating the phaseHistory if the phase hasn't changed
    filteredData.phaseHistory.push(filteredData.currentPhaseName);
  }


  defaultLog.debug('Updating with:', filteredData);
  defaultLog.debug('--------------------------');

  if (projectLegislationYear == 2018) {
    fullProjectObject.legislation_2018 = filteredData;
  } else if (projectLegislationYear == 2002) {
    fullProjectObject.legislation_2002 = filteredData;
  } else if (projectLegislationYear == 1996) {
    fullProjectObject.legislation_1996 = filteredData;
  }
  fullProjectObject.currentLegislationYear = 'legislation_' + projectLegislationYear;

  var doc = await Project.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(objId) }, fullProjectObject, { upsert: false, returnDocument: 'after' });
  // Project.update({ _id: new mongoose.Types.ObjectId(objId) }, { $set: updateObj }, function (err, o) {
  if (doc) {
    Utils.recordAction('Put', 'Project', args.swagger.params.auth_payload.preferred_username, objId);
    demiPush.project(doc);
    return Actions.sendResponse(res, 200, doc);
  } else {
    defaultLog.info('Couldn\'t find that object!');
    return Actions.sendResponse(res, 404, {});
  }
};

// Publish/Unpublish the project
// We need to make this publish also update the current legislation year and the year list
exports.protectedPublish = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var ProjObject = args.swagger.params.ProjObject.value;
  defaultLog.info('Publish Project:', objId);

  var Project = require('mongoose').model('Project');
  try {
    const o = await Project.findOne({ _id: objId });
    if (o) {
      defaultLog.info('o:', o);

      if (ProjObject && ProjObject.legislationYear) {
        o.currentLegislationYear = 'legislation_' + ProjObject.legislationYear;
      }

      try {
        const published = await Actions.publish(o, true);
        Utils.recordAction('Publish', 'Project', args.swagger.params.auth_payload.preferred_username, objId);
        demiPush.project(published);
        return Actions.sendResponse(res, 200, published);
      } catch (err) {
        return Actions.sendResponse(res, 500, err);
      }
    } else {
      defaultLog.info('Couldn\'t find that object!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (err) {
    return Actions.sendResponse(res, 500, err);
  }
};
exports.protectedUnPublish = async function (args, res) {
  var objId = args.swagger.params.projId.value;
  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  defaultLog.info('UnPublish Project:', objId);

  var Project = require('mongoose').model('Project');
  try {
    const o = await Project.findOne({ _id: objId });
    if (o) {
      defaultLog.info('o:', o);
      try {
        const unpublished = await Actions.unPublish(o);
        Utils.recordAction('Unpublish', 'Project', args.swagger.params.auth_payload.preferred_username, objId);
        demiPush.project(unpublished);
        return Actions.sendResponse(res, 200, unpublished);
      } catch (err) {
        return Actions.sendResponse(res, err.code, err);
      }
    } else {
      defaultLog.info('Couldn\'t find that object!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (err) {
    return Actions.sendResponse(res, 500, err);
  }
};

var handleCommentPeriodForBannerQueryParameters = function (args, projectId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return null;
  }
  if (args.swagger.params.cpStart && args.swagger.params.cpStart.value !== undefined && args.swagger.params.cpEnd && args.swagger.params.cpEnd.value !== undefined) {
    var dateStartedRange, dateCompletedRange, currentDateInBetween = null;
    var queryStringStart = qs.parse(args.swagger.params.cpStart.value);
    var queryStringEnd = qs.parse(args.swagger.params.cpEnd.value);

    if (queryStringStart.since && queryStringEnd.until) {
      dateStartedRange = { $and: [{ dateStarted: { $gte: new Date(queryStringStart.since) } }, { dateStarted: { $lte: new Date(queryStringEnd.until) } }] };
      dateCompletedRange = { $and: [{ dateCompleted: { $gte: new Date(queryStringStart.since) } }, { dateCompleted: { $lte: new Date(queryStringEnd.until) } }] };
      currentDateInBetween = { $and: [{ dateStarted: { $lte: new Date(queryStringStart.since) } }, { dateCompleted: { $gte: new Date(queryStringEnd.until) } }] };
    } else {
      return null;
    }

    var match = {
      _schemaName: 'CommentPeriod',
      project: new mongoose.Types.ObjectId(projectId),
      // Use read-array visibility instead of isPublished: ENGAGE CPs never store
      // isPublished in the document (they control visibility via the read array).
      read: { $in: ['public'] },
      $or: [dateStartedRange, dateCompletedRange, currentDateInBetween]
    };

    return {
      '$lookup':
      {
        from: 'epic',
        pipeline: [{
          $match: match
        }],
        as: 'commentPeriodForBanner'
      }
    };
  } else {
    return null;
  }
};


var addStandardQueryFilters = function (query, args) {
  if (args.swagger.params.publishDate && args.swagger.params.publishDate.value !== undefined) {
    const queryString = qs.parse(args.swagger.params.publishDate.value);
    if (queryString.since && queryString.until) {
      // Combine queries as logical AND for the dataset.
      Object.assign(query, {
        $and: [
          {
            publishDate: { $gte: new Date(queryString.since) }
          },
          {
            publishDate: { $lte: new Date(queryString.until) }
          }
        ]
      });
    } else if (queryString.eq) {
      Object.assign(query, {
        publishDate: { $eq: new Date(queryString.eq) }
      });
    } else {
      // Which param was set?
      if (queryString.since) {
        Object.assign(query, {
          publishDate: { $gte: new Date(queryString.since) }
        });
      }
      if (queryString.until) {
        Object.assign(query, {
          publishDate: { $lte: new Date(queryString.until) }
        });
      }
    }
  }
  if (args.swagger.params.tantalisId && args.swagger.params.tantalisId.value !== undefined) {
    Object.assign(query, { tantalisID: args.swagger.params.tantalisId.value });
  }
  if (args.swagger.params.cl_file && args.swagger.params.cl_file.value !== undefined) {
    Object.assign(query, { cl_file: args.swagger.params.cl_file.value });
  }
  if (args.swagger.params.purpose && args.swagger.params.purpose.value !== undefined) {
    const queryString = qs.parse(args.swagger.params.purpose.value);
    let queryArray = [];
    if (Array.isArray(queryString.eq)) {
      queryArray = queryString.eq;
    } else {
      queryArray.push(queryString.eq);
    }
    Object.assign(query, { purpose: { $in: queryArray } });
  }
  if (args.swagger.params.subpurpose && args.swagger.params.subpurpose.value !== undefined) {
    var queryString = qs.parse(args.swagger.params.subpurpose.value);
    var queryArray = [];
    if (Array.isArray(queryString.eq)) {
      queryArray = queryString.eq;
    } else {
      queryArray.push(queryString.eq);
    }
    Object.assign(query, { subpurpose: { $in: queryArray } });
  }
  if (args.swagger.params.type && args.swagger.params.type.value !== undefined) {
    Object.assign(query, { type: args.swagger.params.type.value });
  }
  if (args.swagger.params.subtype && args.swagger.params.subtype.value !== undefined) {
    Object.assign(query, { subtype: args.swagger.params.subtype.value });
  }
  if (args.swagger.params.status && args.swagger.params.status.value !== undefined) {
    const queryString = qs.parse(args.swagger.params.status.value);
    let queryArray = [];
    if (Array.isArray(queryString.eq)) {
      queryArray = queryString.eq;
    } else {
      queryArray.push(queryString.eq);
    }
    Object.assign(query, { status: { $in: queryArray } });
  }
  if (args.swagger.params.agency && args.swagger.params.agency.value !== undefined) {
    Object.assign(query, { agency: args.swagger.params.agency.value });
  }
  if (args.swagger.params.businessUnit && args.swagger.params.businessUnit.value !== undefined) {
    Object.assign(query, { businessUnit: args.swagger.params.businessUnit.value });
  }
  if (args.swagger.params.client && args.swagger.params.client.value !== undefined) {
    Object.assign(query, { client: args.swagger.params.client.value });
  }
  if (args.swagger.params.tenureStage && args.swagger.params.tenureStage.value !== undefined) {
    Object.assign(query, { tenureStage: args.swagger.params.tenureStage.value });
  }
  if (args.swagger.params.areaHectares && args.swagger.params.areaHectares.value !== undefined) {
    const queryString = qs.parse(args.swagger.params.areaHectares.value);
    if (queryString.gte && queryString.lte) {
      // Combine queries as logical AND to compute a Rnage of values.
      Object.assign(query, {
        $and: [
          {
            areaHectares: { $gte: parseFloat(queryString.gte, 10) }
          },
          {
            areaHectares: { $lte: parseFloat(queryString.lte, 10) }
          }
        ]
      });
    } else if (queryString.eq) {
      // invalid or not specified, treat as equal
      Object.assign(query, {
        areaHectares: { $eq: parseFloat(queryString.eq, 10) }
      });
    } else {
      // Which param was set?
      if (queryString.gte) {
        Object.assign(query, {
          areaHectares: { $gte: parseFloat(queryString.gte, 10) }
        });
      }
      if (queryString.lte) {
        Object.assign(query, {
          areaHectares: { $lte: parseFloat(queryString.lte, 10) }
        });
      }
    }
  }
  if (args.swagger.params.centroid && args.swagger.params.centroid.value !== undefined) {
    // defaultLog.info("Looking up features based on coords:", args.swagger.params.centroid.value);
    // Throws if parsing fails.
    Object.assign(query, {
      centroid: { $geoIntersects: { $geometry: { type: 'Polygon', coordinates: JSON.parse(args.swagger.params.centroid.value) } } }
    });
  }
  // Allows filtering of apps that have had their last status change greater than this epoch time.
  if (args.swagger.params.statusHistoryEffectiveDate && args.swagger.params.statusHistoryEffectiveDate !== undefined) {
    const queryString = qs.parse(args.swagger.params.statusHistoryEffectiveDate.value);
    Object.assign(query, {
      $or: [{ statusHistoryEffectiveDate: null }, { statusHistoryEffectiveDate: { $gte: parseInt(queryString.gte, 10) } }]
    });
  }
  return query;
};

var serializeProjectVirtuals = function (data) {
  var Project = mongoose.model('Project');
  data.forEach(function (item) {
    if (item) {
      var project = new Project(item);
      item.nature = project.get('nature');
    }
  });
};

exports.getFeaturedDocuments = async function (args, res) {
  try {
    if (args.swagger.params.projId && args.swagger.params.projId.value && mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      let projectModel = mongoose.model('Project');
      const project = await projectModel.findOne({ _id: args.swagger.params.projId.value });
      if (project) {
        let featuredDocs = await fetchFeaturedDocuments(project);
        return Actions.sendResponse(res, 200, featuredDocs);
      } else {
        return Actions.sendResponse(res, 404, { status: 404, message: 'Project not found' });
      }
    } else {
      return Actions.sendResponse(res, 404, { status: 404, message: 'Project not found' });
    }
  } catch (e) {
    return Actions.sendResponse(res, 500, {});
  }
};

exports.getFeaturedDocumentsSecure = async function (args, res) {
  try {
    if (args.swagger.params.projId && args.swagger.params.projId.value && mongoose.Types.ObjectId.isValid(args.swagger.params.projId.value)) {
      let project = await mongoose.model('Project').findById(new mongoose.Types.ObjectId(args.swagger.params.projId.value));

      let featuredDocs = await fetchFeaturedDocuments(project);

      return Actions.sendResponse(res, 200, featuredDocs);
    }

    return Actions.sendResponse(res, 404, { status: 404, message: 'Project not found' });
  } catch (e) {
    return Actions.sendResponse(res, 500, {});
  }
};

var fetchFeaturedDocuments = async function (project) {
  try {
    if (mongoose.Types.ObjectId.isValid(project._id)) {
      let documents = await mongoose.model('Document').find({ project: project._id, isFeatured: true });

      return documents;
    } else {
      return [];
    }
  } catch (e) {
    throw Error(e);
  }
};