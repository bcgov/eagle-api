const _ = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose = require('mongoose');

const Actions = require('../helpers/actions');
const Utils = require('../helpers/utils');
const constants = require('../helpers/constants').schemaTypes;
const createDocumentAggr = require('../aggregators/documentAggregator').createDocumentAggr;
const createProjectAggr = require('../aggregators/projectAggregator').createProjectAggr;
const createGroupAggr = require('../aggregators/groupAggregator').createGroupAggr;
const createUserAggr = require('../aggregators/userAggregator').createUserAggr;
const createRecentActivityAggr = require('../aggregators/recentActivityAggregator').createRecentActivityAggr;
const createInspectionAggr = require('../aggregators/inspectionAggregator').createInspectionAggr;
const createInspectionElementAggr = require('../aggregators/inspectionAggregator').createInspectionElementAggr;
const createNotificationProjectAggr = require('../aggregators/notificationProjectAggregator').createNotificationProjectAggr;
const createItemAggr = require('../aggregators/itemAggregator').createItemAggr;
const searchAggregator = require('../aggregators/searchAggregator');

const searchCollection = async function (roles, keywords, schemaName, pageNum, pageSize, project, projectLegislation, sortField = undefined, sortDirection = undefined, caseSensitive, populate = false, and, or, sortingValue) {
  const aggregateCollation = {
    locale: 'en',
    strength: 2
  };

  defaultLog.info('collation:', aggregateCollation);
  defaultLog.info('populate:', populate);
  
  // Create main matching aggregation.
  let aggregation = await searchAggregator.createMatchAggr(schemaName, project, keywords, caseSensitive, or, and, roles)

  // Create appropriate aggregations for the schema.
  let schemaAggregation;
  switch (schemaName) {
    case constants.DOCUMENT:
      schemaAggregation = createDocumentAggr(populate, roles);
      break;
    case constants.PROJECT:
      schemaAggregation = createProjectAggr(projectLegislation);
      break;
    case constants.GROUP:
      schemaAggregation = createGroupAggr(populate);
      break;
    case constants.USER:
      schemaAggregation = createUserAggr(populate);
      break;
    case constants.RECENT_ACTIVITY:
      schemaAggregation = createRecentActivityAggr(populate);
      break;
    case constants.INSPECTION:
      schemaAggregation = createInspectionAggr(populate);
      break;
    case constants.INSPECTION_ELEMENT:
      schemaAggregation = createInspectionElementAggr(populate);
      break;
    case constants.NOTIFICATION_PROJECT:
      schemaAggregation = createNotificationProjectAggr(populate);
      break;
    default:
      schemaAggregation = [];
      break;
  }

  // Create the sorting and paging aggregations.
  const sortingPagingAggr = searchAggregator.createSortingPagingAggr(schemaName, sortingValue, sortField, sortDirection, pageNum, pageSize);

  // Combine all the aggregations.
  aggregation = [...aggregation, ...schemaAggregation, ...sortingPagingAggr];

  return new Promise(function (resolve, reject) {
    var collectionObj = mongoose.model(schemaName);

    collectionObj.aggregate(aggregation)
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

  defaultLog.info("Searching keywords:", keywords);
  defaultLog.info("Searching datasets:", dataset);
  defaultLog.info("Searching project:", project);
  defaultLog.info("pageNum:", pageNum);
  defaultLog.info("pageSize:", pageSize);
  defaultLog.info("sortBy:", sortBy);
  defaultLog.info("caseSensitive:", caseSensitive);
  defaultLog.info("and:", and);
  defaultLog.info("or:", or);
  defaultLog.info("_id:", _id);
  defaultLog.info("populate:", populate);
  defaultLog.info('roles:', roles);

  Utils.recordAction('Search', keywords, args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : 'public');

  let sortDirection = undefined;
  let sortField = undefined;
  const sortingValue = {};

  // if this is a document, and a request to sort by isFeatured hasn't been requested,
  // we add it in... UNLESS we're also filtering by a specific set of types
  // that reference certificate or amendment tab documents in public...
  // this condition may break with filters (which also break the public requirement)
  // so it has not been included at this point
  if (dataset === constants.DOCUMENT && !sortingValue.hasOwnProperty('isFeatured')) {
    sortingValue.isFeatured = -1;
  }

  sortBy.forEach((value) => {
    sortDirection = value.charAt(0) === '-' ? -1 : 1;
    sortField = value.slice(1);
    if (!Object.prototype.hasOwnProperty.call(sortingValue, sortField) && sortField && sortField !== '') {
      sortingValue[sortField] = sortDirection;
    }
  });

  defaultLog.info("sortingValue:", sortingValue);
  defaultLog.info("sortField:", sortField);
  defaultLog.info("sortDirection:", sortDirection);

  if (dataset !== constants.ITEM) {
    const collectionData = await searchCollection(roles, keywords, dataset, pageNum, pageSize, project, projectLegislation, sortField, sortDirection, caseSensitive, populate, and, or, sortingValue);
    
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
    const aggregation = createItemAggr(args.swagger.params._id.value, args.swagger.params._schemaName.value, roles);

    let data = await collectionObj.aggregate(aggregation);

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
  executeQuery(args, res);
};

exports.protectedGet = function (args, res) {
  executeQuery(args, res);
};

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};
