var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var qs = require('qs');

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

var unwindProjectData = function (aggregation, projectLegislationDataKey, projectLegislationDataIdKey, projectLegislation) {
  const ceeaInvolvementField = `${projectLegislationDataKey}.CEAAInvolvement`;
  const eacDecisionField = `${projectLegislationDataKey}.eacDecision`;
  const proponentField = `${projectLegislationDataKey}.proponent`;

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
      '$unwind': `$${ceeaInvolvementField}`
    },
  );

  // EA Decision lookup.
  aggregation.push(
    {
      '$lookup': {
        'from': 'epic',
        'localField': eacDecisionField,
        'foreignField': '_id',
        'as': eacDecisionField
      }
    },
    {
      '$unwind': `$${eacDecisionField}`
    },
  );

  // Proponent lookup.
  aggregation.push(
    {
      '$lookup': {
        'from': 'epic',
        'localField': proponentField,
        'foreignField': '_id',
        'as': proponentField
      }
    },
    {
      '$unwind': `$${proponentField}`
    },
  );

  // If projectLegislationYear = "" then use the legislationDefault key on the project model
  // pop proponent if exists.
  if (!projectLegislation || projectLegislation == "default") {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + ".read"]: "$read",
          [projectLegislationDataKey + ".pins"]: "$pins",
          [projectLegislationDataKey + ".pinsHistory"]: "$pinsHistory",
          [projectLegislationDataKey + ".pinsRead"]: "$pinsRead",
        }
      }
    );
    
    aggregation.push(
      {
        "$replaceRoot": { newRoot:  "$" + projectLegislationDataKey }
      }
    );
  } else {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + ".read"]: "$read",
          [projectLegislationDataKey + ".pins"]: "$pins",
          [projectLegislationDataKey + ".pinsHistory"]: "$pinsHistory"
        }
      }
    );

    aggregation.push(
      {
        "$addFields": {
          "project": { "$mergeObjects": ["$project",  "$" + projectLegislationDataKey]},
       }
      }
    );

    //Null out the projectLegislationYear
    aggregation.push({
      "$project": {["project.legislation_" + projectLegislation]: 0 }
    });

    aggregation.push({
      "$project": {[projectLegislationDataKey]: 0 }
    });
  }
}

var getProjectLegislationInfo = function(legislation) {
  let projectLegislationDataKey;
  switch (legislation) {
    //TODO: Update this to work for future years
    case "1996":
    case "2002":
    case "2018":
      projectLegislationDataKey = "legislation_" + legislation;
      break;
    case "all":
      //TODO: Make this extendable. Pull from a list
      projectLegislationDataKey = [ "legislation_1996", "legislation_2002", "legislation_2018" ];
      break;
    default:
      //TODO: need to know current legislation, to set proper default
      projectLegislationDataKey = "default";
      break;
    }
    return {projectLegislationDataKey, projectLegislationDataIdKey: projectLegislationDataKey + "._id"};

};

// TODO: make more generic
var setProjectDefault = function(aggregation, projectOnly) {
  if (projectOnly) {
    // variables are tricky for fieldpaths ie. "default"
    aggregation.push(
      {
        $addFields: {
          "default": {
            $switch: {
              branches: [
                { 
                  case: { $eq: [ "$currentLegislationYear", 'legislation_1996' ]},
                  then: "$legislation_1996"
                },
                {
                  case: { $eq: [ "$currentLegislationYear", 'legislation_2002' ]},
                  then: "$legislation_2002"
                },
                {
                  case: { $eq: [ "$currentLegislationYear", 'legislation_2018' ]},
                  then: "$legislation_2018"
                }
              ], default: "$legislation_2002"
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
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_1996' ]},
                  then: "$project.legislation_1996"
                },
                {
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_2002' ]},
                  then: "$project.legislation_2002"
                },
                {
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_2018' ]},
                  then: "$project.legislation_2018"
                }
              //TODO: watch out for the default case. If we hit this then we will have empty projects
              ], default: "$project.legislation_2002"
            }
          }
        }
      }
    );
  }
}

var searchCollection = async function (roles, keywords, schemaName, pageNum, pageSize, project, projectLegislation, sortField = undefined, sortDirection = undefined, caseSensitive, populate = false, and, or) {
  var properties = undefined;
  if (project) {
    properties = { project: mongoose.Types.ObjectId(project) };
  }

  // optional search keys
  var searchProperties = undefined;
  if (keywords) {
    searchProperties = { $text: { $search: keywords, $caseSensitive: caseSensitive } };
  }

  // query modifiers
  var andExpArray = await generateExpArray(and, roles, schemaName);

  // filters
  var orExpArray = await generateExpArray(or, roles, schemaName);

  var modifier = {};
  if (andExpArray.length > 0 && orExpArray.length > 0) {
    modifier = { $and: [{ $and: andExpArray }, { $or: orExpArray }] };
  } else if (andExpArray.length === 0 && orExpArray.length > 0) {
    modifier = { $and: orExpArray };
  } else if (andExpArray.length > 0 && orExpArray.length === 0) {
    modifier = { $and: andExpArray };
  }

  var match = {
    _schemaName: schemaName,
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

  let searchResultAggregation = [];
  // We don't want to have sort in the aggregation if the front end doesn't need sort.
  if (sortField && sortDirection) {
    searchResultAggregation.push(
      {
        $sort: sortingValue
      }
    );
  }
  searchResultAggregation.push(
    {
      $skip: pageNum * pageSize
    },
    {
      $limit: pageSize
    }
  );


  var aggregation = [
    {
      $match: match
    }
  ];

  let collation = {
    locale: 'en',
    strength: 2
  };

  console.log('collation:', collation);
  //Get our project Legislation info. Need this for other spots in the code
  const projectLegislationObj = getProjectLegislationInfo(projectLegislation);
  const projectLegislationDataKey = projectLegislationObj.projectLegislationDataKey;
  const projectLegislationDataIdKey = projectLegislationObj.projectLegislationDataIdKey;

  if (schemaName === 'Document') {
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

  if (schemaName === 'Project') {
    if (projectLegislation === "all") {
      projectLegislationDataKey.forEach ( dataKey => {  
        const ceeaInvolvementField = `${dataKey}.CEAAInvolvement`;
        const eacDecisionField = `${dataKey}.eacDecision`;
        const proponentField = `${dataKey}.proponent`;
    
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
        );
    
        // EA Decision lookup.
        aggregation.push(
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
        );

        // pop proponent if exists.
        aggregation.push(
          {
            '$lookup': {
              "from": "epic",
              "localField": proponentField,
              "foreignField": "_id",
              "as": proponentField
            }
          });
        aggregation.push(
          {
            "$unwind": {
              path: `$${proponentField}`,
              preserveNullAndEmptyArrays: true
            }
          },
        );
      });
    } else if ((!projectLegislation) || projectLegislation === "default") {
      setProjectDefault(aggregation, true)
      // unwind proponents and move embedded data up to root
      unwindProjectData(aggregation, "default", "default._id", projectLegislation)
    } else {
      unwindProjectData(aggregation, projectLegislationDataKey, projectLegislationDataIdKey, projectLegislation)
    }
  }

  if (schemaName === 'Group') {
    // pop project and user if exists.
    aggregation.push(
      {
        '$lookup': {
          "from": "epic",
          "localField": "project",
          "foreignField": "_id",
          "as": "project"
        }
      });
    aggregation.push(
      {
        "$unwind": "$project"
      },
    );
  }

  if (schemaName === 'User') {
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
  if (populate === true && schemaName !== 'Project') {
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
    //TODO: Might need to apply this merge to all project calls. This is to get rid of all the legislation keys
    if (schemaName === "Document" || schemaName === "RecentActivity") {
      // Here we have documents with a nested Project and a nested legislation key
      setProjectDefault(aggregation, false)

      // We need to merge the legislation key with the Project while preserving the _id and the rest of the document info
      // TODO: Abstract these types of stages, as we will need to do this a lot")
      aggregation.push({
        "$addFields": {
          "project": { "$mergeObjects": ["$project", "$project.default"] },
       }
      });
      // Unset the nested legislation data keys
      aggregation.push({
        "$project": {["project.legislation_2002"]: 0 }
      });
      aggregation.push({
        "$project": {["project.legislation_1996"]: 0 }
      });
      aggregation.push({
        "$project": {["project.default"]: 0 }
      });
      
    } 
  }

  if (populate === true && schemaName === 'Inspection') {
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
  } else if (populate === true && schemaName === 'InspectionElement') {
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

  if (populate === true && schemaName === 'NotificationProject') {
    aggregation.push(
      {
        $lookup: {
          from: 'epic',
          as: 'documents',
          let: { project: "$_id", schema: 'Document' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$project', '$$project'] },
                    { $eq: ['$_schemaName', 'Document'] }
                  ]
                }
              }
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
                            in: { $setIsSubset: [["$$fieldTag"], ['public']] }
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
          ]
        }
      }
    );
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
      searchResults: searchResultAggregation,
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
      .collation(collation)
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

var executeQuery = async function (args, res, next) {
  var _id = args.swagger.params._id ? args.swagger.params._id.value : null;
  var keywords = args.swagger.params.keywords.value;
  var dataset = args.swagger.params.dataset.value;
  var project = args.swagger.params.project.value;
  var populate = args.swagger.params.populate ? args.swagger.params.populate.value : false;
  var pageNum = args.swagger.params.pageNum.value || 0;
  var pageSize = args.swagger.params.pageSize.value || 25;
  var projectLegislation = args.swagger.params.projectLegislation.value || '';
  var sortBy = args.swagger.params.sortBy.value ? args.swagger.params.sortBy.value : keywords ? ['-score'] : [];
  var caseSensitive = args.swagger.params.caseSensitive ? args.swagger.params.caseSensitive.value : false;
  var and = args.swagger.params.and ? args.swagger.params.and.value : '';
  var or = args.swagger.params.or ? args.swagger.params.or.value : '';
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

  var roles = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.realm_access.roles : ['public'];

  console.log("Searching Collection:", dataset);

  console.log("******************************************************************");
  console.log(roles);
  console.log("******************************************************************");

  Utils.recordAction('Search', keywords, args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : 'public');

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
    var itemData = await searchCollection(roles, keywords, dataset, pageNum, pageSize, project, projectLegislation, sortField, sortDirection, caseSensitive, populate, and, or);
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

exports.protectedOptions = function (args, res, next) {
  res.status(200).send();
};
