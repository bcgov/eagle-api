var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var qs = require('qs');

const createDocumentAggr = require('../aggregators/documentAggregator').createDocumentAggr;
const createProjectAggr = require('../aggregators/projectAggregator').createProjectAggr;
const createGroupAggr = require('../aggregators/groupAggregator').createGroupAggr;
const createUserAggr = require('../aggregators/userAggregator').createUserAggr;
const createRecentActivityAggr = require('../aggregators/recentActivityAggregator').createRecentActivityAggr;
const createInspectionAggr = require('../aggregators/inspectionAggregator').createInspectionAggr;
const createInspectionElementAggr = require('../aggregators/inspectionAggregator').createInspectionElementAggr;
const createNotificationProjectAggr = require('../aggregators/notificationProjectAggregator').createNotificationProjectAggr;

function isEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

//Helper to validate a string as object ID
// needed since mongoose will validate any 12 char string as valid id. Ie. 'municipality'
mongoose.isValidObjectId = function(str) {
  if (typeof str !== 'string') {
    return false;
  }
  return str.match(/^[a-f\d]{24}$/i);
};

var generateExpArray = async function (field, roles, schemaName) {
  var expArray = [];
  if (field && field != undefined) {
    var queryString = qs.parse(field);
    console.log("queryString:", queryString);
    // Note that we need map and not forEach here because Promise.all uses
    // the returned array!
    await Promise.all(Object.keys(queryString).map(async item => {
      var entry = queryString[item];
      console.log("item:", item, entry);
      var orArray = [];
      if (item === 'pcp') {
        await handlePCPItem(roles, expArray, entry);
      } else if (Array.isArray(entry)) {
        // Arrays are a list of options so will always be ors
        if (schemaName === 'Project') {
          var fields = handleProjectTerms(item);
          fields.map(field => {
            entry.map(element => {
              orArray.push(getConvertedValue(field, element));
            });
          })
        } else {
          entry.map(element => {
            orArray.push(getConvertedValue(item, element));
          });
        }
        expArray.push({ $or: orArray });
      } else {
        let fields = []
        if (schemaName === 'Project') {
          fields = handleProjectTerms(item);
        } else {
          fields.push(item)
        }
        switch (item) {
          case 'decisionDateStart':
            for(let field of fields) {
              handleDateStartItem(orArray, field, entry);
            }
            break;
          case 'decisionDateEnd':
            for(let field of fields) {
              handleDateEndItem(orArray, field, entry);
            }
            break;
          case 'datePostedStart':
            handleDateStartItem(orArray, ['datePosted'], entry);
            break;
          case 'datePostedEnd':
            handleDateEndItem(orArray, ['datePosted'], entry);
            break;
          default:
            if (schemaName === 'Project') {
              for(let field of fields) {
                orArray.push(getConvertedValue(field, entry));
              }
              break;
            } else {
              orArray.push(getConvertedValue(fields[0], entry));
              break;
            }
        }
        expArray.push({ $or: orArray });
      }
    }));
  }
  console.log("expArray:", expArray);
  return expArray;
};

var handleProjectTerms = function(item) {
  let legislation_items = [];
  //leave _id as is, for project details calls
  if (item === '_id') {
    legislation_items.push(item)
    return legislation_items;
  }

  if (item === 'decisionDateStart' || item === 'decisionDateEnd') {
    item = 'decisionDate';
  }
  // prepend for embedded fields
  let legislations = ['legislation_1996', 'legislation_2002', 'legislation_2018'];
  for (let legis of legislations) {
    legislation_items.push(legis + '.' + item)
  }
  return legislation_items;
}

var getConvertedValue = function (item, entry) {
  if (isNaN(entry)) {
    if (mongoose.isValidObjectId(entry)) {
      console.log("objectid");
      // ObjectID
      return { [item]: mongoose.Types.ObjectId(entry) };
    } else if (entry === 'true') {
      console.log("bool");
      // Bool
      var tempObj = {};
      tempObj[item] = true;
      tempObj.active = true;
      return tempObj;
    } else if (entry === 'false') {
      console.log("bool");
      // Bool
      return { [item]: false };
    } else {
      console.log("string");
      return { [item]: entry };
    }
  } else {
    console.log("number");
    return { [item]: parseInt(entry) };
  }
};

var handlePCPItem = async function (roles, expArray, value) {
  if (Array.isArray(value)) {
    // Arrays are a list of options so will always be ors
    var orArray = [];
    // Note that we need map and not forEach here because Promise.all uses
    // the returned array!
    await Promise.all(value.map(async entry => {
      orArray.push(await getPCPValue(roles, entry));
    }));
    expArray.push({ $or: orArray });
  } else {
    expArray.push(await getPCPValue(roles, value));
  }
};

var getPCPValue = async function (roles, entry) {
  console.log('pcp: ', entry);

  var query = null;
  var now = new Date();

  switch (entry) {
    case 'pending':
      var in7days = new Date();
      in7days.setDate(now.getDate() + 7);

      query = {
        _schemaName: 'CommentPeriod',
        $and: [
          { dateStarted: { $gt: now } },
          { dateStarted: { $lte: in7days } }
        ]
      };
      break;

    case 'open':
      query = {
        _schemaName: 'CommentPeriod',
        $and: [
          { dateStarted: { $lte: now } },
          { dateCompleted: { $gt: now } }
        ]
      };
      break;

    case 'closed':
      query = {
        _schemaName: 'CommentPeriod',
        dateCompleted: { $lt: now }
      };
      break;

    default:
      console.log('Unknown PCP entry');
  }

  var pcp = {};

  if (query) {
    var data = await Utils.runDataQuery('CommentPeriod', roles, query, ['project'], null, null, null, null, false, null);
    var ids = _.map(data, 'project');
    pcp = { _id: { $in: ids } };
  }

  console.log('pcp', pcp);
  return pcp;
};

var handleDateStartItem = function (expArray, field, entry) {
  var date = new Date(entry);

  // Validate: valid date?
  if (!isNaN(date)) {
    var start = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    expArray.push({ [field]: { $gte: start } });
  }
};

var handleDateEndItem = function (expArray, field, entry) {
  var date = new Date(entry);

  // Validate: valid date?
  if (!isNaN(date)) {
    var end = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    expArray.push({ [field]: { $lt: end } });
  }
};

const searchCollection = async function (roles, keywords, schemaName, pageNum, pageSize, project, projectLegislation, sortField = undefined, sortDirection = undefined, caseSensitive, populate = false, and, or, sortingValue) {
  const aggregateCollation = {
    locale: 'en',
    strength: 2
  };

  defaultLog.info('collation:', aggregateCollation);
  defaultLog.info('populate:', populate);
  
  let aggregation = await createMatchAggr(schemaName, project, keywords, caseSensitive, or, and, roles)

  // Create appropriate aggregations for the schema.
  let schemaAggregation;
  switch (schemaName) {
    case 'Document':
      schemaAggregation = createDocumentAggr(populate, roles);
      break;
    case 'Project':
      schemaAggregation = createProjectAggr(projectLegislation);
      break;
    case 'Group':
      schemaAggregation = createGroupAggr(populate);
      break;
    case 'User':
      schemaAggregation = createUserAggr(populate);
      break;
    case 'RecentActivity':
      schemaAggregation = createRecentActivityAggr(populate);
      break;
    case 'Inspection':
      schemaAggregation = createInspectionAggr(populate);
      break;
    case 'InspectionElement':
      schemaAggregation = createInspectionElementAggr(populate);
      break;
    case 'NotificationProject':
      schemaAggregation = createNotificationProjectAggr(populate);
      break;
    default:
      schemaAggregation = [];
      break;
  }

  // Combine aggregations;
  aggregation = [...aggregation, ...schemaAggregation];

  aggregation.push({
    $redact: {
      $cond: {
        if: {
          // This way, if read isn't present, we assume public no roles array.
          $and: [
            { $cond: { if: "$read", then: true, else: false } },
            {
              $anyElementTrue: {
                $map: {
                  input: "$read",
                  as: "fieldTag",
                  in: { $setIsSubset: [["$$fieldTag"], roles] }
                }
              }
            }
          ]
        },
        then: "$$KEEP",
        else: {
          $cond: { if: "$read", then: "$$PRUNE", else: "$$DESCEND" }
        }
      }
    }
  });

  aggregation.push({
    $addFields: {
      score: { $meta: "textScore" }
    }
  });

  const sortingPagingAggr = createSortingPagingAggr(schemaName, sortingValue, sortField, sortDirection, pageNum, pageSize);

  aggregation.push({
    $facet: {
      searchResults: sortingPagingAggr,
      meta: [
        {
          $count: "searchResultsTotal"
        }
      ]
    }
  });

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

exports.publicGet = async function (args, res, next) {
  executeQuery(args, res, next);
};

exports.protectedGet = function (args, res, next) {
  executeQuery(args, res, next);
};

const executeQuery = async function (args, res, next) {
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

  sortBy.map((value) => {
    sortDirection = value.charAt(0) == '-' ? -1 : 1;
    sortField = value.slice(1);
    if (Object.prototype.hasOwnProperty.call(sortingValue, sortField)){
      //field is already set, don't set it again with an identical secondary sort
    } else {
      sortingValue[sortField] = sortDirection;
    }
  });

  defaultLog.info("sortingValue:", sortingValue);
  defaultLog.info("sortField:", sortField);
  defaultLog.info("sortDirection:", sortDirection);

  if (dataset !== 'Item') {
    const itemData = await searchCollection(roles, keywords, dataset, pageNum, pageSize, project, projectLegislation, sortField, sortDirection, caseSensitive, populate, and, or, sortingValue);
    
    if (dataset === 'Comment') {
      // Filter
      _.each(itemData[0].searchResults, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }
    return Actions.sendResponse(res, 200, itemData);

  } else if (dataset === 'Item') {
    var collectionObj = mongoose.model(args.swagger.params._schemaName.value);
    console.log("ITEM GET", { _id: args.swagger.params._id.value });

    let aggregation = [
      {
        "$match": { _id: mongoose.Types.ObjectId(args.swagger.params._id.value) }
      },
      {
        $redact: {
          $cond: {
            if: {
              // This way, if read isn't present, we assume public no roles array.
              $and: [
                { $cond: { if: "$read", then: true, else: false } },
                {
                  $anyElementTrue: {
                    $map: {
                      input: "$read",
                      as: "fieldTag",
                      in: { $setIsSubset: [["$$fieldTag"], roles] }
                    }
                  }
                }
              ]
            },
            then: "$$KEEP",
            else: {
              $cond: { if: "$read", then: "$$PRUNE", else: "$$DESCEND" }
            }
          }
        }
      }
    ];

    if (args.swagger.params._schemaName.value === 'Inspection') {
      // pop elements and their items.
      aggregation.push(
        {
          '$lookup': {
            "from": "epic",
            "localField": "elements",
            "foreignField": "_id",
            "as": "elements"
          }
        }
      );
      aggregation.push({
        "$lookup": {
          "from": "epic",
          "localField": "project",
          "foreignField": "_id",
          "as": "project"
        }
      });
      aggregation.push({
        "$addFields": {
          project: "$project",
        }
      });
      aggregation.push({
        "$unwind": {
          "path": "$project",
          "preserveNullAndEmptyArrays": true
        }
      });
    } else if (args.swagger.params._schemaName.value === 'InspectionElement') {
      aggregation.push(
        {
          '$lookup': {
            "from": "epic",
            "localField": "items",
            "foreignField": "_id",
            "as": "items"
          }
        }
      );
    }
    var data = await collectionObj.aggregate(aggregation);

    if (args.swagger.params._schemaName.value === 'Comment') {
      // Filter
      _.each(data, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }

    if (args.swagger.params._schemaName.value === 'Project') {
      // If we are a project, and we are not authed, we need to sanitize some fields.
      data = Utils.filterData(args.swagger.params._schemaName.value, data, roles);
    }
    return Actions.sendResponse(res, 200, data);
  } else {
    console.log('Bad Request');
    return Actions.sendResponse(res, 400, {});
  }
};


/**
 * Create an aggregation that sets the sorting and paging for a query.
 * 
 * @param {string} schemaName Schema being searched on
 * @param {array} sortValues Values to sort by
 * @param {string} sortField Single field to sort by
 * @param {number} sortDirection Direction of sort
 * @param {number} pageNum Page number to offset results by
 * @param {number} pageSize Result set size
 * 
 * @returns {array} Aggregation of sorting and paging
 */
const createSortingPagingAggr = function(schemaName, sortValues, sortField, sortDirection, pageNum, pageSize) {
  const searchResultAggregation = [];
  let defaultTwoSorts = false;

  if (schemaName == "Document" &&  sortValues['datePosted'] === -1 || sortValues['score'] === -1){
    defaultTwoSorts = true;
  } else if (schemaName == "Document" && Object.keys(sortValues).length > 1 ){
    // If there are more than two values, but they're not the default values ignore the second value
    const keysArr = Object.keys(sortValues);
    const tempSortValue = {};
    tempSortValue[keysArr[0]] = sortValues[keysArr[0]];
    sortValues = tempSortValue;
  }else {
    sortValues = {};
    sortValues[sortField] = sortDirection;
  }

  // We don't want to have sort in the aggregation if the front end doesn't need sort.
  if (sortField && sortDirection) {

    if (defaultTwoSorts){
      searchResultAggregation.push(

        { $addFields: {
          "date": 
            { $dateToString: {
              "format": "%Y-%m-%d", "date": "$datePosted"
            }}
          
        }},
        { "$sort": { "date": -1, "displayName": 1 }}

      );
    } else {
      searchResultAggregation.push(
        {
          $sort: sortValues
        }
      );
    }

  }

  searchResultAggregation.push(
    {
      $skip: pageNum * pageSize
    },
    {
      $limit: pageSize
    }
  );

  return searchResultAggregation;
};

const createMatchAggr = async function(schemaName, projectId, keywords, caseSensitive, orModifier, andModifier, roles) {
  const aggregation = [];
  let projectModifier;
  let keywordModifier;

  if (projectId) {
    projectModifier = { project: mongoose.Types.ObjectId(projectId) };
  }

  if (keywords) {
    keywordModifier = { $text: { $search: keywords, $caseSensitive: caseSensitive } };
  }

  // query modifiers
  const andExpArray = await generateExpArray(andModifier, roles, schemaName);

  // filters
  const orExpArray = await generateExpArray(orModifier, roles, schemaName);

  let modifier = {};
  if (andExpArray.length > 0 && orExpArray.length > 0) {
    modifier = { $and: [{ $and: andExpArray }, { $or: orExpArray }] };
  } else if (andExpArray.length === 0 && orExpArray.length > 0) {
    modifier = { $and: orExpArray };
  } else if (andExpArray.length > 0 && orExpArray.length === 0) {
    modifier = { $and: andExpArray };
  }

  aggregation.push({
    $match: {
      _schemaName: schemaName,
      ...(isEmpty(modifier) ? undefined : modifier),
      ...(projectModifier ? projectModifier : undefined),
      ...(keywordModifier ? keywordModifier : undefined),
      $or: [
        { isDeleted: { $exists: false } },
        { isDeleted: false },
      ]
    } 
  });

  return aggregation;
};

exports.protectedOptions = function (args, res, next) {
  res.status(200).send();
};
