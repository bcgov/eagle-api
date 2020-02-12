const mongoose = require('mongoose');
const qs = require('qs');
const _ = require('lodash');

const constants = require('../helpers/constants').schemaTypes;
const Utils = require('../helpers/utils');

/**
 * Create an aggregation that sets the matching criteria for search.
 * 
 * @param {string} schemaName Schema being searched on
 * @param {string} projectId Project ID
 * @param {string} keywords List of keywords to search on
 * @param {boolean} caseSensitive Case sensitive search?
 * @param {array} orModifier Search criteria for an 'or' search
 * @param {array} andModifier Search criteria for an 'and' search
 * @param {array} roles User's roles
 * 
 * @returns {array} Aggregation for a match
 */
exports.createMatchAggr = async (schemaName, projectId, keywords, caseSensitive, orModifier, andModifier, roles) => {
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

  // Check document permissions
  aggregation.push(
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
    },
    {
      $addFields: {
        score: { $meta: "textScore" }
      }
    }
  );

  return aggregation;
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
 exports.createSortingPagingAggr = function(schemaName, sortValues, sortField, sortDirection, pageNum, pageSize) {
  const searchResultAggregation = [];
  let defaultTwoSorts = false;

  if (schemaName === constants.DOCUMENT && sortValues['datePosted'] === -1 || sortValues['score'] === -1) {
    defaultTwoSorts = true;
  } else {
    // if sortField is null, this would create a broken sort, so ignore it if its null
    if(sortField) {
      sortValues[sortField] = sortDirection;
    }
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
        { $sort: { date: -1, displayName: 1 }}
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

  const combinedAggregation = [{
    $facet: {
      searchResults: searchResultAggregation,
      meta: [
        {
          $count: "searchResultsTotal"
        }
      ]
    }
  }];
    
  return combinedAggregation;
};

const generateExpArray = async (field, roles, schemaName) => {
  const expArray = [];
  if (field) {
    const queryString = qs.parse(field);
    console.log("queryString:", queryString);

    await Promise.all(Object.keys(queryString).map(async item => {
      // make sure the entry isn't URL encoded. Also, shift any ampersand
      // values from %26 to &
      const entry = decodeURIComponent(queryString[item]);
      console.log("item:", item, entry);
      const orArray = [];

      if (item === 'pcp') {
        await handlePCPItem(roles, expArray, entry);
      } else if (Array.isArray(entry)) {
        // Arrays are a list of options so will always be ors
        if (schemaName === constants.PROJECT) {
          const fields = handleProjectTerms(item);
          fields.map(field => {
            entry.map(element => {
              orArray.push(getConvertedValue(field, element));
            });
          })
        } else {
          entry.map(element => {
            return orArray.push(getConvertedValue(item, element));
          });
        }

        expArray.push({ $or: orArray });
      } else {
        let fields = []
        if (schemaName === constants.PROJECT) {
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
            if (schemaName === constants.PROJECT) {
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
      return null;
    }));
  }

  console.log("expArray:", expArray);
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
}

const getConvertedValue = (item, entry) => {
  if (isNaN(entry)) {
    if (isValidObjectId(entry)) {
      console.log("objectid");
      // ObjectID
      return { [item]: mongoose.Types.ObjectId(entry) };
    } else if (entry === 'true') {
      console.log("bool");
      // Bool
      const tempObj = {};
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

const handlePCPItem = async (roles, expArray, value) => {
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
