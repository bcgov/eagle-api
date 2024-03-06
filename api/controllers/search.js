const _ = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose = require('mongoose');

const Actions = require('../helpers/actions');
const Utils = require('../helpers/utils');
const constants = require('../helpers/constants').schemaTypes;
const documentAggregator = require('../aggregators/documentAggregator');
const projectAggregator = require('../aggregators/projectAggregator');
const cacAggregator = require('../aggregators/cacAggregator');
const groupAggregator = require('../aggregators/groupAggregator');
const userAggregator = require('../aggregators/userAggregator');
const recentActivityAggregator = require('../aggregators/recentActivityAggregator');
const inspectionAggregator = require('../aggregators/inspectionAggregator');
const notificationProjectAggregator = require('../aggregators/notificationProjectAggregator');
const itemAggregator = require('../aggregators/itemAggregator');
const commentPeriodAggregator = require('../aggregators/commentPeriodAggregator');
const searchAggregator = require('../aggregators/searchAggregator');
const aggregateHelper = require('../helpers/aggregators');

const searchCollection = async function (roles, keywords, schemaName, pageNum, pageSize, project, projectLegislation, sortField = undefined, sortDirection = undefined, caseSensitive, populate = false, and, or, sortingValue, categorized, fuzzy) {
  const aggregateCollation = {
    locale: 'en',
    strength: 2
  };

  defaultLog.info('collation:', aggregateCollation);
  defaultLog.info('populate:', populate);

  // Decode any parameters here that may arrive encoded.
  const decodedKeywords = keywords ? decodeURIComponent(keywords) : undefined;

  // Create appropriate aggregations for the schema.
  let schemaAggregation;
  let matchAggregation;
  switch (schemaName) {
  case constants.DOCUMENT:
    matchAggregation = await documentAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, categorized, roles, fuzzy);
    schemaAggregation = documentAggregator.createDocumentAggr(populate, roles, sortingValue, sortField, sortDirection, pageNum, pageSize);
    break;
  case constants.PROJECT:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles, fuzzy);
    schemaAggregation = projectAggregator.createProjectAggr(projectLegislation);
    break;
  case constants.CAC:
    matchAggregation = await cacAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    // None needed
    schemaAggregation = [];
    break;
  case constants.GROUP:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = groupAggregator.createGroupAggr(populate);
    break;
  case constants.USER:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = userAggregator.createUserAggr(populate);
    break;
  case constants.RECENT_ACTIVITY:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = recentActivityAggregator.createRecentActivityAggr(populate);
    break;
  case constants.INSPECTION:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = inspectionAggregator.createInspectionAggr(populate);
    break;
  case constants.INSPECTION_ELEMENT:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = inspectionAggregator.createInspectionElementAggr(populate);
    break;
  case constants.PROJECT_NOTIFICATION:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = notificationProjectAggregator.createNotificationProjectAggr(populate);
    break;
  case constants.LIST:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    break;
  case constants.COMMENT_PERIOD:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    schemaAggregation = commentPeriodAggregator.createCommentPeriodAggr(populate);
    break;
  case constants.ORGANIZATION:
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, decodedKeywords, caseSensitive, or, and, roles);
    break;
  default:
    matchAggregation = null;
    schemaAggregation = null;
    break;
  }

  // A match aggregation must exist.
  if (!matchAggregation) {
    throw new Error('Search missing match aggregation');
  }

  // keyword regex
  let keywordRegexFilter = [];//!fuzzy && decodedKeywords ? searchAggregator.createKeywordRegexAggr(decodedKeywords, schemaName) : [];

  // Create the sorting and paging aggregations.
  // For Document schema, the sorting and pagination pipelines have already been added for performance purpose
  const resultAggr = (schemaName === constants.DOCUMENT?searchAggregator.createResultAggregator():
    aggregateHelper.createSortingPagingAggr(schemaName, sortingValue, sortField, sortDirection, pageNum, pageSize));

  // Combine all the aggregations.
  let aggregation;
  if (!schemaAggregation) {
    aggregation = [...matchAggregation, ...keywordRegexFilter, ...resultAggr];
  } else {
    aggregation = [...matchAggregation, ...schemaAggregation, ...keywordRegexFilter, ...resultAggr];
  }

  return new Promise(function (resolve, reject) {
    var collectionObj = mongoose.model(schemaName);

    collectionObj.aggregate(aggregation)
      .allowDiskUse(true)
      .collation(aggregateCollation)
      .exec()
      .then(function (data) {
        resolve(Utils.filterData(schemaName, data, roles));
      }, reject);
  });
};

const executeQuery = async function (args, res) {
  const _id = args.swagger.params._id ? args.swagger.params._id.value : null;
  const roles = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.realm_access.roles : ['public'];
  const keywords = args.swagger.params.keywords.value;
  const dataset = args.swagger.params.dataset.value;
  const project = args.swagger.params.project.value;
  const populate = args.swagger.params.populate ? args.swagger.params.populate.value : false;
  const pageNum = args.swagger.params.pageNum.value || 0;
  const pageSize = args.swagger.params.pageSize.value || 25;
  const projectLegislation = args.swagger.params.projectLegislation.value || '';
  const sortBy = args.swagger.params.sortBy.value ? args.swagger.params.sortBy.value : keywords ? ['-score'] : [];
  const caseSensitive = args.swagger.params.caseSensitive ? args.swagger.params.caseSensitive.value : false;
  const and = args.swagger.params.and ? args.swagger.params.and.value : '';
  const or = args.swagger.params.or ? args.swagger.params.or.value : '';
  const categorized = args.swagger.params.categorized ? args.swagger.params.categorized.value : null;
  const fuzzy = args.swagger.params.fuzzy.value ? args.swagger.params.fuzzy.value : false;

  defaultLog.info('Searching keywords:', keywords);
  defaultLog.info('Fuzzy text search:', fuzzy);
  defaultLog.info('Searching datasets:', dataset);
  defaultLog.info('Searching project:', project);
  defaultLog.info('pageNum:', pageNum);
  defaultLog.info('pageSize:', pageSize);
  defaultLog.info('sortBy:', sortBy);
  defaultLog.info('caseSensitive:', caseSensitive);
  defaultLog.info('and:', and);
  defaultLog.info('or:', or);
  defaultLog.info('_id:', _id);
  defaultLog.info('populate:', populate);
  defaultLog.info('roles:', roles);

  if (args.swagger.params.project && args.swagger.params.project.value && !mongoose.Types.ObjectId.isValid(project)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (_id && !mongoose.Types.ObjectId.isValid(_id)) {
    return Actions.sendResponse(res, 400, { });
  }

  await Utils.recordAction('Search', keywords, args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : 'public');

  let sortDirection = undefined;
  let sortField = undefined;
  const sortingValue = {};

  sortBy.forEach((value) => {
    // To handle multiple sort values passed by comma delimiter which occurs when multiple sort by fields are used (somehow)
    if (value.includes(",")){
      let sortParams = value.split(",");
      sortParams.forEach((sortValue)=>{
        sortDirection = sortValue.charAt(0) === '-' ? -1 : 1;
        sortField = sortValue.slice(1);
        sortingValue[sortField] = sortDirection;
      });
    } else {
      sortDirection = value.charAt(0) === '-' ? -1 : 1;
      sortField = value.slice(1);
      if (!Object.prototype.hasOwnProperty.call(sortingValue, sortField) && sortField && sortField !== '') {
        sortingValue[sortField] = sortDirection;
      }
    }
  });

  if (sortField === '') {
    sortField = sortBy[0];
  }

  defaultLog.info('sortingValue:', sortingValue);
  defaultLog.info('sortField:', sortField);
  defaultLog.info('sortDirection:', sortDirection);

  if (dataset !== constants.ITEM) {
    const collectionData = await searchCollection(roles, keywords, dataset, pageNum, pageSize, project, projectLegislation, sortField, sortDirection, caseSensitive, populate, and, or, sortingValue, categorized, fuzzy);

    // TODO: this should be moved into the aggregation.
    if (dataset === constants.COMMENT) {
      // Filter
      _.each(collectionData[0].searchResults, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }

    // attach featured documents ID's
    if (dataset === constants.PROJECT) {
      collectionData[0].searchResults = await Utils.attachFeaturedDocuments(collectionData[0].searchResults);
    }

    return Actions.sendResponse(res, 200, collectionData);

  } else if (dataset === constants.ITEM) {
    const collectionObj = mongoose.model(args.swagger.params._schemaName.value);
    const aggregation = itemAggregator.createItemAggr(args.swagger.params._id.value, args.swagger.params._schemaName.value, roles);
    let data = await collectionObj.aggregate(aggregation).allowDiskUse(true);

    if (args.swagger.params._schemaName.value === constants.COMMENT) {
      // Filter
      _.each(data, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }

    if (args.swagger.params._schemaName.value === constants.PROJECT) {
      // If we are a project, and we are not authed, we need to sanitize some fields.
      data = Utils.filterData(args.swagger.params._schemaName.value, data, roles);
      data = await Utils.attachFeaturedDocuments(data);
    }

    return Actions.sendResponse(res, 200, data);
  } else {
    console.log('Bad Request');
    return Actions.sendResponse(res, 400, {});
  }
};

/***** Exported functions  *****/
exports.publicGet = async function (args, res) {
  await executeQuery(args, res);
};

exports.protectedGet = async function (args, res) {
  await executeQuery(args, res);
};

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};
