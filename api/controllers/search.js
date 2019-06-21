var auth = require("../helpers/auth");
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var request = require('request');
var _accessToken = null;
var qs = require('qs');

function isEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

var searchCollection = async function (roles, keywords, collection, pageNum, pageSize, project, sortField, sortDirection, query, populate = false, or) {
  var properties = undefined;
  if (project) {
    properties = { project: mongoose.Types.ObjectId(project) };
  }

  // optional search keys
  var searchProperties = undefined;
  if (keywords) {
    searchProperties = { $text: { $search: keywords } };
  }

  // optional keyed lookups
  var queryModifier = {};
  if (query && query !== undefined) {
    var queryString = qs.parse(query);
    console.log("query:", queryString);
    Object.keys(queryString).map(item => {
      console.log("item:", item, queryString[item]);
      if (isNaN(queryString[item])) {
        // String or Bool
        if (queryString[item] === 'true') {
          // Bool
          queryModifier[item] = true;
          queryModifier.active = true;
        } else if (queryString[item] === 'false') {
          // Bool
          queryModifier[item] = false;
        } else {
          // String
          if (mongoose.Types.ObjectId.isValid(queryString[item])) {
            queryModifier[item] = mongoose.Types.ObjectId(queryString[item]);
          } else {
            queryModifier[item] = queryString[item];
          }
        }
      } else {
        // Number
        queryModifier[item] = parseInt(queryString[item]);
      }
    })
  }

  // TODO: Combine this with queryModifier function.
  // Issue lies with if (Array.isArray(orQueryString[item]))
  var orExpArray = [];
  if (or && or !== undefined) {
    var orQueryString = qs.parse(or);
    console.log("or:", orQueryString);
    Object.keys(orQueryString).map(item => {
      console.log("item:", item, orQueryString[item]);
      if (isNaN(orQueryString[item])) {
        // String or Bool
        if (orQueryString[item] === 'true') {
          // Bool
          var tempObj = {}
          tempObj[item] = true;
          tempObj.active = true;
          orExpArray.push(tempObj);
        } else if (orQueryString[item] === 'false') {
          // Bool
          orExpArray.push({ [item]: false });
        } else {
          // String
          if (Array.isArray(orQueryString[item])) {
            orQueryString[item].map(entry => {
              orExpArray.push({ [item]: entry });
            });
          } else {
            if (mongoose.Types.ObjectId.isValid(orQueryString[item])) {
              queryModifier[item] = mongoose.Types.ObjectId(orQueryString[item]);
              orExpArray.push({ [item]: mongoose.Types.ObjectId(orQueryString[item]) });
            } else {
              orExpArray.push({ [item]: orQueryString[item] });
            }
          }
        }
      } else {
        // Number
        orExpArray.push({ [item]: parseInt(orQueryString[item]) });
      }
    })
  }

  var modifier = {};
  if (!isEmpty(queryModifier) && orExpArray.length > 0) {
    modifier = { $and: [queryModifier, { $or: orExpArray }] };
  } else if (isEmpty(queryModifier) && orExpArray.length > 0) {
    modifier = { $and: [{ $or: orExpArray }] };
  } else if (!isEmpty(queryModifier) && orExpArray.length === 0) {
    modifier = queryModifier;
  }

  var match = {
    _schemaName: collection,
    ...(isEmpty(modifier) ? undefined : modifier),
    ...(searchProperties ? searchProperties : undefined),
    ...(properties ? properties : undefined),
    $or: [
      { isDeleted: { $exists: false } },
      { isDeleted: false },
    ]
  };

  console.log("modifier:", modifier);
  console.log("match:", match);

  var sortingValue = {};
  sortingValue[sortField] = sortDirection;

  // We don't want to have sort in the aggrigation if the front end doesn't need sort.
  let searchResultAggrigation = [
    {
      $sort: sortingValue
    },
    {
      $skip: pageNum * pageSize
    },
    {
      $limit: pageSize
    }
  ];

  var aggregation = [
    {
      $match: match
    }
  ];

  if (collection === 'Document') {
    // Allow documents to be sorted by status based on publish existence
    aggregation.push(
      {
        $addFields: {
          "status": {
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
                        in: { $setIsSubset: [["$$fieldTag"], ['public']] }
                      }
                    }
                  }
                ]
              },
              then: 'published',
              else: 'unpublished'
            }
          }
        }
      }
    );
  }

  if (collection === 'Project') {
    // pop proponent if exists.
    aggregation.push(
      {
        '$lookup': {
          "from": "epic",
          "localField": "proponent",
          "foreignField": "_id",
          "as": "proponent"
        }
      });
    aggregation.push(
      {
        "$unwind": "$proponent"
      },
    );
  }

  if (collection === 'User') {
    // pop proponent if exists.
    aggregation.push(
      {
        '$lookup': {
          "from": "epic",
          "localField": "org",
          "foreignField": "_id",
          "as": "org"
        }
      });
    aggregation.push(
      {
        "$unwind": "$org"
      },
    );
  }

  console.log('populate:', populate);
  if (populate === true && collection !== 'Project') {
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
      "$unwind": "$project"
    });
  }

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

  aggregation.push({
    $facet: {
      searchResults: searchResultAggrigation,
      meta: [
        {
          $count: "searchResultsTotal"
        }
      ]
    }
  })

  return new Promise(function (resolve, reject) {
    var collectionObj = mongoose.model(collection);
    collectionObj.aggregate(aggregation)
      .exec()
      .then(function (data) {
        resolve(data);
      }, reject);
  });
}

exports.publicGet = async function (args, res, next) {
  executeQuery(args, res, next);
};

exports.protectedGet = function (args, res, next) {
  executeQuery(args, res, next);
};

var executeQuery = async function (args, res, next) {
  var _id = args.swagger.params._id ? args.swagger.params._id.value : null;
  var keywords = args.swagger.params.keywords.value;
  var dataset = args.swagger.params.dataset.value;
  var project = args.swagger.params.project.value;
  var populate = args.swagger.params.populate ? args.swagger.params.populate.value : false;
  var pageNum = args.swagger.params.pageNum.value || 0;
  var pageSize = args.swagger.params.pageSize.value || 25;
  var sortBy = args.swagger.params.sortBy.value || ['-score'];
  var query = args.swagger.params.query ? args.swagger.params.query.value : '';
  var or = args.swagger.params.or ? args.swagger.params.or.value : '';
  defaultLog.info("Searching keywords:", keywords);
  defaultLog.info("Searching datasets:", dataset);
  defaultLog.info("Searching project:", project);
  defaultLog.info("pageNum:", pageNum);
  defaultLog.info("pageSize:", pageSize);
  defaultLog.info("sortBy:", sortBy);
  defaultLog.info("query:", query);
  defaultLog.info("or:", or);
  defaultLog.info("_id:", _id);
  defaultLog.info("populate:", populate);

  var roles = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.realm_access.roles : ['public'];

  console.log("******************************************************************");
  console.log(roles);
  console.log("******************************************************************");

  Utils.recordAction('search', keywords, args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : 'public')

  var sortDirection = undefined;
  var sortField = undefined;

  var sortingValue = {};
  sortBy.map((value) => {
    sortDirection = value.charAt(0) == '-' ? -1 : 1;
    sortField = value.slice(1);
    sortingValue[sortField] = sortDirection;
  });

  console.log("sortingValue:", sortingValue);
  defaultLog.info("sortField:", sortField);
  defaultLog.info("sortDirection:", sortDirection);

  if (dataset !== 'Item') {

    console.log("Searching Collection:", dataset);
    console.log("sortField:", sortField);
    var data = await searchCollection(roles, keywords, dataset, pageNum, pageSize, project, sortField, sortDirection, query, populate, or)
    if (dataset === 'Comment') {
      // Filter
      _.each(data[0].searchResults, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }
    return Actions.sendResponse(res, 200, data);

  } else if (dataset === 'Item') {
    var collectionObj = mongoose.model(args.swagger.params._schemaName.value);
    console.log("ITEM GET", { _id: args.swagger.params._id.value })
    var data = await collectionObj.aggregate([
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
    ]);
    if (args.swagger.params._schemaName.value === 'Comment') {
      // Filter
      _.each(data, function (item) {
        if (item.isAnonymous === true) {
          delete item.author;
        }
      });
    }
    return Actions.sendResponse(res, 200, data);
  } else {
    console.log('Bad Request');
    return Actions.sendResponse(res, 400, {});
  }
};

exports.protectedOptions = function (args, res, next) {
  res.status(200).send();
};