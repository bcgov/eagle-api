const _ = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose = require('mongoose');

const Actions = require('../helpers/actions');
const Utils = require('../helpers/utils');
const constants = require('../helpers/constants').schemaTypes;

// Lazy-loaded: only required when TYPESENSE_ENABLED=true, so a missing package
// or misconfiguration never prevents the search controller from loading.
let _typesenseClient = null;
function getTypesenseClient() {
  if (!_typesenseClient) {
    _typesenseClient = require('../helpers/typesenseClient');
  }
  return _typesenseClient;
}
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

// Pagination limits
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX_PUBLIC = 1000;  // unauthenticated requests
const PAGE_SIZE_MAX_AUTH   = 1000; // authenticated staff requests
const PAGE_SIZE_MAX_LIST   = 500;  // List dataset (reference/dropdown data)

const searchCollection = async function (roles, keywords, schemaName, pageNum, pageSize, project, projectLegislation, sortField = undefined, sortDirection = undefined, caseSensitive, populate = false, and, or, sortingValue, categorized, fuzzy) {
  const aggregateCollation = {
    locale: 'en',
    strength: 2
  };

  defaultLog.debug('collation:', aggregateCollation);
  defaultLog.debug('populate:', populate);

  // Decode any parameters here that may arrive encoded.
  const decodedKeywords = keywords ? decodeURIComponent(keywords) : undefined;

  // Create appropriate aggregations for the schema.
  let schemaAggregation;
  let matchAggregation;
  let regexKeywordAggregation = [];
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
  // NOTE: RecentActivity with populate uses an optimized pipeline (see below)
  // that paginates BEFORE $lookup to avoid N×$lookup on the entire collection.
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
    // Comment Periods are searched via project name, need to add keyword after schemaAggregation to match on project.name
    matchAggregation = await searchAggregator.createMatchAggr(schemaName, project, '', false, or, and, roles);
    schemaAggregation = commentPeriodAggregator.createCommentPeriodAggr(populate);
    regexKeywordAggregation = await searchAggregator.createRegexForProjectLookupAggr(decodedKeywords, caseSensitive);
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

  // Performance optimization for RecentActivity with populate:
  // Paginate BEFORE $lookup so we only join 'pageSize' documents (e.g. 10)
  // instead of running $lookup on the entire matched set (thousands of docs).
  if (schemaName === constants.RECENT_ACTIVITY && populate && schemaAggregation && schemaAggregation.length > 0) {
    const sortStages = [];
    if (sortField && sortDirection) {
      sortStages.push({ $sort: sortingValue });
    }
    aggregation = [
      ...matchAggregation,
      ...keywordRegexFilter,
      {
        $facet: {
          searchResults: [
            ...sortStages,
            { $skip: pageNum * pageSize },
            { $limit: pageSize },
            ...schemaAggregation
          ],
          meta: [{ $count: 'searchResultsTotal' }]
        }
      }
    ];
  } else if (schemaName === constants.PROJECT && (!projectLegislation || projectLegislation === 'default') && schemaAggregation && schemaAggregation.length > 1) {
    // Performance optimization for Project with default legislation:
    // schemaAggregation[0] is $addFields (setProjectDefault - picks correct legislation year).
    // schemaAggregation[1..] are 4×$lookup/$unwind + $addFields + $replaceRoot.
    // Run setProjectDefault first so we can sort by default.fieldName,
    // then paginate BEFORE expensive lookups.
    const preSortStage = schemaAggregation[0]; // $addFields { default: ... }
    const postPaginationStages = schemaAggregation.slice(1); // lookups + replaceRoot

    // Prefix sort fields with 'default.' since name/type/region live inside
    // the default sub-document until $replaceRoot flattens them.
    const adjustedSortValues = {};
    for (const [key, val] of Object.entries(sortingValue)) {
      adjustedSortValues[`default.${key}`] = val;
    }

    const sortStages = [];
    if (sortField && sortDirection) {
      sortStages.push({ $sort: adjustedSortValues });
    }

    aggregation = [
      ...matchAggregation,
      ...keywordRegexFilter,
      preSortStage,
      {
        $facet: {
          searchResults: [
            ...sortStages,
            { $skip: pageNum * pageSize },
            { $limit: pageSize },
            ...postPaginationStages
          ],
          meta: [{ $count: 'searchResultsTotal' }]
        }
      }
    ];
  } else if (!schemaAggregation) {
    aggregation = [...matchAggregation, ...keywordRegexFilter, ...resultAggr];
  } else {
    aggregation = [...matchAggregation, ...schemaAggregation, ...keywordRegexFilter, ...regexKeywordAggregation, ...resultAggr];
  }

  return new Promise(function (resolve, reject) {
    var collectionObj = mongoose.model(schemaName);

    collectionObj.aggregate(aggregation)
      .allowDiskUse(true)
      .collation(aggregateCollation)
      .option('maxTimeMS', 45000)
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
  // swagger-security.js always sets auth_payload (synthetic public payload for unauthenticated routes).
  // Distinguish real auth by checking roles: synthetic public = ['public'] only.
  const isAuthenticated = !(roles.length === 1 && roles[0] === 'public');
  const pageNum = args.swagger.params.pageNum.value || 0;
  const rawPageSize = args.swagger.params.pageSize.value || PAGE_SIZE_DEFAULT;
  if (rawPageSize < 0) {
    return Actions.sendResponse(res, 400, { message: 'pageSize must be a positive integer' });
  }
  const maxPageSize = dataset === constants.LIST ? PAGE_SIZE_MAX_LIST : (isAuthenticated ? PAGE_SIZE_MAX_AUTH : PAGE_SIZE_MAX_PUBLIC);
  const pageSize = Math.min(rawPageSize, maxPageSize);
  const projectLegislation = args.swagger.params.projectLegislation.value || '';
  // Normalize sortBy to always be an array; swagger may pass a single string when only one sort field is provided.
  const sortByRaw = args.swagger.params.sortBy.value ? args.swagger.params.sortBy.value : keywords ? ['-score'] : [];
  const sortBy = Array.isArray(sortByRaw) ? sortByRaw : [sortByRaw];
  const caseSensitive = args.swagger.params.caseSensitive ? args.swagger.params.caseSensitive.value : false;
  const and = args.swagger.params.and ? args.swagger.params.and.value : '';
  const or = args.swagger.params.or ? args.swagger.params.or.value : '';
  const categorized = args.swagger.params.categorized ? args.swagger.params.categorized.value : null;
  const fuzzy = args.swagger.params.fuzzy.value ? args.swagger.params.fuzzy.value : false;

  defaultLog.debug('Searching keywords:', keywords);
  defaultLog.debug('Fuzzy text search:', fuzzy);
  defaultLog.debug('Searching datasets:', dataset);
  defaultLog.debug('Searching project:', project);
  defaultLog.debug('pageNum:', pageNum);
  defaultLog.debug('pageSize:', pageSize);
  defaultLog.debug('sortBy:', sortBy);
  defaultLog.debug('caseSensitive:', caseSensitive);
  defaultLog.debug('and:', and);
  defaultLog.debug('or:', or);
  defaultLog.debug('_id:', _id);
  defaultLog.debug('populate:', populate);
  defaultLog.debug('roles:', roles);

  if (args.swagger.params.project && args.swagger.params.project.value && !mongoose.Types.ObjectId.isValid(project)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (_id && !mongoose.Types.ObjectId.isValid(_id)) {
    return Actions.sendResponse(res, 400, { });
  }

  // Validate dataset parameter
  if (!dataset) {
    defaultLog.error('Missing required parameter: dataset');
    return Actions.sendResponse(res, 400, { error: 'Missing required parameter: dataset' });
  }
  const validDatasets = Object.values(constants);
  if (!validDatasets.includes(dataset)) {
    defaultLog.error('Invalid dataset:', dataset);
    return Actions.sendResponse(res, 400, { error: `Invalid dataset: ${dataset}. Must be one of: ${validDatasets.join(', ')}` });
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

    return Actions.sendResponse(res, 200, collectionData);

  } else if (dataset === constants.ITEM) {
    const schemaNameVal = args.swagger.params._schemaName.value;
    const allowedPublicSchemas = [
      constants.DOCUMENT,
      constants.PROJECT,
      constants.COMMENT,
      constants.COMMENT_PERIOD,
      constants.RECENT_ACTIVITY,
      constants.INSPECTION,
      constants.INSPECTION_ELEMENT,
      constants.PROJECT_NOTIFICATION,
      constants.LIST,
      constants.ORGANIZATION
    ];

    if (!allowedPublicSchemas.includes(schemaNameVal)) {
      defaultLog.warn('Search attempted on non-public schema: %s', schemaNameVal);
      return Actions.sendResponse(res, 400, { message: 'Invalid search schema' });
    }

    const collectionObj = mongoose.model(schemaNameVal);
    const aggregation = itemAggregator.createItemAggr(args.swagger.params._id.value, schemaNameVal, roles);
    let data = await collectionObj.aggregate(aggregation).allowDiskUse(true);

    if (schemaNameVal === constants.COMMENT) {
      // Filter
      _.each(data, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }

    if (schemaNameVal === constants.PROJECT) {
      // If we are a project, and we are not authed, we need to sanitize some fields.
      data = Utils.filterData(schemaNameVal, data, roles);
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

/**
 * GET /api/public/search/key
 *
 * Returns a Typesense scoped search key with filter_by: "allowed_roles:=[<roles>]"
 * baked in. The key is safe to expose to browsers — Typesense enforces the embedded
 * filter regardless of what the client sends in the request.
 *
 * Public (unauthenticated) requests receive a key scoped to allowed_roles:=[public].
 * Authenticated requests receive a key scoped to their Keycloak roles + public.
 */
exports.publicGetSearchKey = function (args, res) {
  const roles = args.swagger.params.auth_payload
    ? args.swagger.params.auth_payload.realm_access.roles
    : ['public'];

  try {
    const typesense = getTypesenseClient();
    const { key, expiresAt } = typesense.generateScopedSearchKey(roles);
    return Actions.sendResponse(res, 200, { key, expiresAt });
  } catch (err) {
    defaultLog.error('Failed to generate scoped search key:', err.message);
    return Actions.sendResponse(res, 500, { error: 'Search key generation failed' });
  }
};
