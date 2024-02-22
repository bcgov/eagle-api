const qs = require('qs');
const _ = require('lodash');
const mongoose = require('mongoose');

const constants = require('../helpers/constants').schemaTypes;
const Utils = require('../helpers/utils');

/**
 * Creates an aggregation with the default project year set as the root.
 *
 * @param {boolean} projectOnly Flag that indicates if the project should be set as root.
 * @returns {array} Aggregate with the default year set.
 */
const setProjectDefault = (projectOnly) => {
  const aggregation = [];

  if (projectOnly) {
    // variables are tricky for fieldpaths ie. "default"
    aggregation.push(
      {
        $addFields: {
          'default': {
            $switch: {
              branches: [
                {
                  case: { $eq: [ '$currentLegislationYear', 'legislation_1996' ]},
                  then: '$legislation_1996'
                },
                {
                  case: { $eq: [ '$currentLegislationYear', 'legislation_2002' ]},
                  then: '$legislation_2002'
                },
                {
                  case: { $eq: [ '$currentLegislationYear', 'legislation_2018' ]},
                  then: '$legislation_2018'
                }
              ],
              default: '$legislation_2002'
            }
          }
        }
      }
    );
  } else {
    aggregation.push(
      {
        $addFields: {
          'project.default': {
            $switch: {
              branches: [
                {
                  case: { $eq: [ '$project.currentLegislationYear', 'legislation_1996' ]},
                  then: '$project.legislation_1996'
                },
                {
                  case: { $eq: [ '$project.currentLegislationYear', 'legislation_2002' ]},
                  then: '$project.legislation_2002'
                },
                {
                  case: { $eq: [ '$project.currentLegislationYear', 'legislation_2018' ]},
                  then: '$project.legislation_2018'
                }
              //TODO: watch out for the default case. If we hit this then we will have empty projects
              ], default: '$project.legislation_2002'
            }
          }
        }
      }
    );
  }

  return aggregation;
};


/**
 * Creates an aggregate of lookups for the desired legislation year.
 *
 * @param {string} projectLegislationDataKey Legislation year key
 * @param {string} projectLegislationDataIdKey Legislation year key with ID
 * @param {string} projectLegislation Desired project year
 * @returns {array} Aggregate with the desired legislation year set
 */
const unwindProjectData = (projectLegislationDataKey, projectLegislationDataIdKey, projectLegislation) => {
  const aggregation = addProjectLookupAggrs(null, projectLegislationDataKey);

  // If project legislation is missing then use the legislationDefault key on the project model
  // pop proponent if exists.
  if (!projectLegislation || projectLegislation == 'default') {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + '.read']: '$read',
          [projectLegislationDataKey + '.pins']: '$pins',
          [projectLegislationDataKey + '.hasMetCommentPeriods']: '$hasMetCommentPeriods',
          [projectLegislationDataKey + '.pinsHistory']: '$pinsHistory',
          [projectLegislationDataKey + '.pinsRead']: '$pinsRead',
          [projectLegislationDataKey + ".cacEmail"]: "$cacEmail",
          [projectLegislationDataKey + ".cacMembers"]: "$cacMembers",
          [projectLegislationDataKey + ".projectCAC"]: "$projectCAC",
          [projectLegislationDataKey + ".projectCACPublished"]: "$projectCACPublished",
          [projectLegislationDataKey + ".score"]: "$score"
        }
      }
    );

    aggregation.push(
      {
        '$replaceRoot': { newRoot:  '$' + projectLegislationDataKey }
      }
    );
  } else {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + '.read']: '$read',
          [projectLegislationDataKey + '.hasMetCommentPeriods']: '$hasMetCommentPeriods',
          [projectLegislationDataKey + '.pins']: '$pins',
          [projectLegislationDataKey + '.pinsHistory']: '$pinsHistory'
        }
      }
    );

    aggregation.push(
      {
        '$addFields': {
          'project': { '$mergeObjects': ['$project',  '$' + projectLegislationDataKey]},
        }
      }
    );

    //Null out the projectLegislationYear
    aggregation.push({
      '$project': {['project.legislation_' + projectLegislation]: 0 }
    });

    aggregation.push({
      '$project': {[projectLegislationDataKey]: 0 }
    });
  }

  return aggregation;
};


/**
 * Creates an aggregate of the main fields that need to have a lookup occur on them.
 *
 * @param {string} dataKey Legislation year key
 * @returns {array} Aggregate that unwinds the linked properties of a project
 */
const addProjectLookupAggrs = (aggregation, dataKey) => {
  const ceeaInvolvementField = `${dataKey}.CEAAInvolvement`;
  const eacDecisionField = `${dataKey}.eacDecision`;
  const proponentField = `${dataKey}.proponent`;
  const currentPhaseField = `${dataKey}.currentPhaseName`;
  if (aggregation === null || typeof aggregation === "undefined") {
    aggregation = [];
  }

  // CEAA Involvement lookup.
  aggregation.push(
    {
      '$lookup': {
        'from': 'epic',
        'localField': ceeaInvolvementField,
        'foreignField': '_id',
        'as': ceeaInvolvementField
      }
    },
    {
      '$unwind': {
        path: `$${ceeaInvolvementField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': eacDecisionField,
        'foreignField': '_id',
        'as': eacDecisionField
      }
    },
    {
      '$unwind': {
        path: `$${eacDecisionField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': currentPhaseField,
        'foreignField': '_id',
        'as': currentPhaseField
      }
    },
    {
      '$unwind': {
        path: `$${currentPhaseField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': proponentField,
        'foreignField': '_id',
        'as': proponentField
      }
    },
    {
      '$unwind': {
        path: `$${proponentField}`,
        preserveNullAndEmptyArrays: true
      }
    }
  );

  return aggregation;
};

const generateExpArray = async (field, roles, schemaName) => {
  const expArray = [];
  if (field) {
    const queryString = qs.parse(field);
    console.log('queryString:', queryString);

    await Promise.all(Object.keys(queryString).map(async item => {
      let entry = queryString[item];
      console.log('item:', item, entry);
      const orArray = [];

      if (item === 'pcp') {
        await handlePCPItem(roles, expArray, decodeURIComponent(entry));
      } else if (Array.isArray(entry)) {
        // Arrays are a list of options so will always be ors
        if (schemaName === constants.PROJECT) {
          const fields = handleProjectTerms(item);
          fields.map(field => {
            entry.map(element => {
              orArray.push(getConvertedValue(field, decodeURIComponent(element)));
            });
          });
        } else {
          entry.map(element => {
            return orArray.push(getConvertedValue(item, decodeURIComponent(element)));
          });
        }

        expArray.push({ $or: orArray });
      } else {
        let fields = [];
        if (schemaName === constants.PROJECT) {
          fields = handleProjectTerms(item);
        } else {
          fields.push(item);
        }

        switch (item) {
        case 'decisionDateStart':
          for(let field of fields) {
            handleDateStartItem(orArray, field, decodeURIComponent(entry));
          }
          break;
        case 'decisionDateEnd':
          for(let field of fields) {
            handleDateEndItem(orArray, field, decodeURIComponent(entry));
          }
          break;
        case 'dateAddedStart':
          handleDateStartItem(orArray, ['dateAdded'], decodeURIComponent(entry));
          break;
        case 'dateAddedEnd':
          handleDateEndItem(orArray, ['dateAdded'], decodeURIComponent(entry));
          break;
        case 'datePostedStart':
          handleDateStartItem(orArray, ['datePosted'], decodeURIComponent(entry));
          break;
        case 'datePostedEnd':
          handleDateEndItem(orArray, ['datePosted'], decodeURIComponent(entry));
          break;
        default:
          if (schemaName === constants.PROJECT) {
            for(let field of fields) {
              orArray.push(getConvertedValue(field, decodeURIComponent(entry)));
            }
            break;
          } else {
            orArray.push(getConvertedValue(fields[0], decodeURIComponent(entry)));
            break;
          }
        }

        expArray.push({ $or: orArray });
      }
      return null;
    }));
  }

  console.log('expArray:', expArray);
  return expArray;
};

const handleProjectTerms = (item) => {
  let legislation_items = [];
  //leave _id as is, for project details calls
  if (item === '_id') {
    legislation_items.push(item);
    return legislation_items;
  }

  if (item === 'decisionDateStart' || item === 'decisionDateEnd') {
    item = 'decisionDate';
  }

  // prepend for embedded fields
  let legislations = ['legislation_1996', 'legislation_2002', 'legislation_2018'];
  for (let legis of legislations) {
    legislation_items.push(legis + '.' + item);
  }

  return legislation_items;
};

const getConvertedValue = (item, entry) => {
  if (isNaN(entry)) {
    if (isValidObjectId(entry)) {
      // ObjectID
      return { [item]: mongoose.Types.ObjectId(entry) };
    } else if (entry.toLowerCase() === 'true') {
      const tempObj = {};
      tempObj[item] = true;
      return tempObj;
    } else if (entry.toLowerCase() === 'false') {
      const tempObj = {};
      tempObj[item] = false;
    } else {
      return { [item]: entry };
    }
  } else {
    return { [item]: parseInt(entry) };
  }
};

const handlePCPItem = async (roles, expArray, value) => {

  if (!Array.isArray(value) && value.includes(',')) {
    value = value.split(',');
  }

  if (Array.isArray(value)) {
    // Arrays are a list of options so will always be ors
    const orArray = [];
    // Note that we need map and not forEach here because Promise.all uses
    // the returned array!
    await Promise.all(value.map(async entry => {
      return orArray.push(await getPCPValue(roles, entry));
    }));
    expArray.push({ $or: orArray });
  } else {
    expArray.push(await getPCPValue(roles, value));
  }
};

//Helper to validate a string as object ID
// needed since mongoose will validate any 12 char string as valid id. Ie. 'municipality'
const isValidObjectId = (str) => {
  if (typeof str !== 'string') {
    return false;
  }
  return str.match(/^[a-f\d]{24}$/i);
};

const getPCPValue = async (roles, entry) => {
  console.log('pcp: ', entry);

  let query = null;
  const now = new Date();
  const in7days = new Date();

  switch (entry) {
  case 'pending':
    in7days.setDate(now.getDate() + 7);

    query = {
      _schemaName: constants.COMMENT_PERIOD,
      $and: [
        { dateStarted: { $gt: now } },
        { dateStarted: { $lte: in7days } }
      ]
    };
    break;

  case 'open':
    query = {
      _schemaName: constants.COMMENT_PERIOD,
      $and: [
        { dateStarted: { $lte: now } },
        { dateCompleted: { $gt: now } }
      ]
    };
    break;

  case 'closed':
    query = {
      _schemaName: constants.COMMENT_PERIOD,
      dateCompleted: { $lt: now }
    };
    break;

  default:
    console.log('Unknown PCP entry');
  }

  var pcp = {};

  if (query) {
    const data = await Utils.runDataQuery(constants.COMMENT_PERIOD, roles, query, ['project'], null, null, null, null, false, null);
    const ids = _.map(data, 'project');
    pcp = { _id: { $in: ids } };
  }

  console.log('pcp', pcp);
  return pcp;
};

const handleDateStartItem = (expArray, field, entry) => {
  const date = new Date(entry);

  // Validate: valid date?
  if (!isNaN(date)) {
    const start = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    expArray.push({ [field]: { $gte: start } });
  }
};

const handleDateEndItem = (expArray, field, entry) => {
  const date = new Date(entry);

  // Validate: valid date?
  if (!isNaN(date)) {
    const end = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    expArray.push({ [field]: { $lt: end } });
  }
};

const isEmpty = (obj) => {
  for (let key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key))
      return false;
  }
  return true;
};

/**
 * Create an aggregation that sets the sorting and paging for a query.
 *
 * @param {string} schemaName Name of the schema
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
  let datePostedHandlingTruncating = false;
  if (sortField && sortValues !=null && typeof sortValues != "undefined" && sortField.includes(",") || Object.keys(sortValues).length > 1){
    //sort will have multiple values passed
    if (sortField.includes("datePosted") || Object.prototype.hasOwnProperty.call(sortValues, "datePosted")){
      //datePosted is too specfic(in it's time) and needs the truncated form of date, can be expanded if other dates are required to be truncated
      let tempSortValues = { };
      for (let property in sortValues){
        if (Object.prototype.hasOwnProperty.call(sortValues, property)) {
          if (property === "datePosted"){
            tempSortValues['date'] = sortValues[property];
          } else {
            tempSortValues[property] = sortValues[property];
          }
        }
      }
      sortValues = tempSortValues;
      datePostedHandlingTruncating = true;
    }

  } else {
    // if sortField is null, this would create a broken sort, so ignore it if its null
    if(sortField && sortValues && sortValues[sortField]) {
      sortValues[sortField] = sortDirection;
    }
  }

  // if we have no sorting going on, we should sort by the score
  if(!sortField) {
    sortValues = { score: -1 };
  }

  // We don't want to have sort in the aggregation if the front end doesn't need sort.
  if (sortField && sortDirection) {
    if(datePostedHandlingTruncating){
      // Currently this is just handling datePosted, if more date variables are needed change datePosted to a variable and detect it above
      searchResultAggregation.push(

        { $addFields: {
          'date':
            { $dateToString: {
              'format': '%Y-%m-%d', 'date': '$datePosted'
            }}

        }},
        { $sort: sortValues }
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
    },
  );

  const combinedAggregation = [
    {
      $facet: {
        searchResults: searchResultAggregation,
        meta: [
          {
            $count: "searchResultsTotal"
          }
        ]
      }
    }
  ];

  // add a new field to store the totalCount which will later used to
  // produce the searchResultsTotal in the final output
  if(schemaName === constants.DOCUMENT) {
    combinedAggregation.push({
      $addFields: {
        'searchResults.totalCount': {
          $let: {
            vars: {
              item: {$arrayElemAt:["$meta",0]}
            },
            in: "$$item.searchResultsTotal"
          }
        }
      }
    },{
      $unwind: {
        path: '$searchResults'
      }
    },{
      $replaceRoot: {newRoot: '$searchResults'}
    });
  }

  return combinedAggregation;
};

// Exporting here so that the functions can be used in
// this file and exported.
exports.setProjectDefault = setProjectDefault;
exports.unwindProjectData = unwindProjectData;
exports.addProjectLookupAggrs = addProjectLookupAggrs;
exports.generateExpArray = generateExpArray;
exports.isEmpty = isEmpty;
exports.createSortingPagingAggr = createSortingPagingAggr;
