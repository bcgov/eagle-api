'use strict';

var _               = require('lodash');
var mongoose        = require('mongoose');
var clamav          = require('clamav.js');
var _serviceHost    = process.env.CLAMAV_SERVICE_HOST || '127.0.0.1';
var _servicePort    = process.env.CLAMAV_SERVICE_PORT || '3310';
var MAX_LIMIT       = 1000;
const defaultLog      = require('winston').loggers.get('default');
var DEFAULT_PAGESIZE  = 100;

exports.buildQuery = function (property, values, query) {
  var oids = [];
  if (_.isArray(values)) {
    _.each(values, function (i) {
      oids.push(mongoose.Types.ObjectId(i));
    });
  } else {
    oids.push(mongoose.Types.ObjectId(values));
  }
  return _.assignIn(query, { [property]: {
    $in: oids
  }
  });
};

exports.getBasePath = function (protocol, host) {
  return protocol + '://' + host;
};

// MBL: TODO Make this event driven instead of synchronous?
exports.avScan = function (buffer) {
  return new Promise(function (resolve) {
    var stream = require('stream');
    // Initiate the source
    var bufferStream = new stream.PassThrough();
    // Write your buffer
    bufferStream.end(buffer);

    clamav.ping(_servicePort, _serviceHost, 1000, function (err) {
      if (err) {
        defaultLog.warn('ClamAV service: ' + _serviceHost + ':' + _servicePort + ' is not available[' + err + ']');
        resolve(false);
      } else {
        clamav.createScanner(_servicePort, _serviceHost)
          .scan(bufferStream, function (err, object, malicious) {
            if (err) {
              defaultLog.info('Error:', err);
              resolve(false);
            } else if (malicious) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
      }
    });
  });
};

exports.getSkipLimitParameters = function (pageSize, pageNum) {
  const params = {};

  var ps = DEFAULT_PAGESIZE; // Default
  if (pageSize && pageSize.value !== undefined) {
    if (pageSize.value > 0) {
      ps = pageSize.value;
    }
  }
  if (pageNum && pageNum.value !== undefined) {
    if (pageNum.value >= 0) {
      params.skip = (pageNum.value * ps);
      params.limit = ps;
    }
  }
  return params;
};

exports.recordAction = async function (action, meta, payload, objId = null){
  var Audit = mongoose.model('Audit');
  var audit = new Audit({
    _objectSchema: 'Query',
    action: action,
    meta: meta,
    objId: objId,
    performedBy: payload,
    timestamp: Date.now(),
  });
  return await audit.save();
};

exports.runDataQuery = async function (modelType, role, query, fields, sortWarmUp, sort, skip, limit, count, preQueryPipelineSteps, populateProponent = false, postQueryPipelineSteps = false, populateProject = false) {
  return new Promise(function (resolve, reject) {
    var theModel = mongoose.model(modelType);
    var projection = {};

    // Fields we always return
    var defaultFields = ['_id',
      'code',
      'proponent',
      'tags',
      'read'];
    _.each(defaultFields, function (f) {
      projection[f] = 1;
    });

    // Add requested fields - sanitize first by including only those that we can/want to return
    _.each(fields, function (f) {
      projection[f] = 1;
    });

    var aggregations = _.compact([
      {
        '$match': query
      },
      (populateProject && modelType !== 'Project') && {
        '$lookup': {
          'from': 'epic',
          'localField': 'project',
          'foreignField': '_id',
          'as': 'project'
        }
      },
      (populateProject && modelType !== 'Project') && {
        '$unwind': {
          'path': '$project',
          'preserveNullAndEmptyArrays': true
        }
      },
      // To unpack the legislation data into the project key
      (modelType === 'Project') && {
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
              ], default: '$legislation_2002'
            }
          }
        }
      },
      (modelType === 'Project') &&  {
        '$addFields': {
          'default.pins': '$pins',
          'default.pinsHistory': '$pinsHistory',
          'default.pinsRead': '$pinsRead',
          'default._id': '$_id',
          "default.projectCAC": '$projectCAC',
          "default.projectCACPublished": '$projectCACPublished',
          "default.cacEmail": '$cacEmail',
          'default.read': '$read'
        }
      },
      // Add the featuredDocuments to the default group
      (modelType === 'Project') &&  {
        '$addFields': {
          'default.featuredDocuments': '$featuredDocuments'
        }
      },
      (modelType === 'Project') && {
        '$replaceRoot': { newRoot:  '$default' }
      },
      (modelType === 'Project') && {
        '$lookup': {
          'from': 'epic',
          'localField': 'CEAAInvolvement',
          'foreignField': '_id',
          'as': 'CEAAInvolvement'
        }
      },
      (modelType === 'Project') && {
        '$unwind': {
          'path': '$CEAAInvolvement',
          'preserveNullAndEmptyArrays': true
        }
      },
      (modelType === 'Project') && {
        '$lookup': {
          'from': 'epic',
          'localField': 'eacDecision',
          'foreignField': '_id',
          'as': 'eacDecision'
        }
      },
      (modelType === 'Project') && {
        '$unwind': {
          'path': '$eacDecision',
          'preserveNullAndEmptyArrays': true
        }
      },
      //Unpack the default key inside a nested call with project data
      // To unpack the legislation data into the project key
      (modelType !== 'Project' && populateProject) && {
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
              ], default: '$project.legislation_2002'
            }
          }
        }
      },
      (modelType !== 'Project' && populateProject) &&  {
        '$addFields': {
          'project.default.pins': '$project.pins',
          'project.default.pinsHistory': '$project.pinsHistory',
          'project.default.pinsRead': '$project.pinsRead',
          'project.default._id': '$project._id',
          'project.default.read': '$project.read'
        }
      },
      (modelType === 'Project' & populateProject) &&  {
        '$addFields': {
          'default.featuredDocuments': '$featuredDocuments'
        }
      },
      (modelType !== 'Project' && populateProject) && {
        '$addFields': {
          'project': '$project.default'
        },
      },
      // Add our projection after we have reformatted project
      {
        '$project': projection
      },
      populateProponent && {
        '$lookup': {
          'from': 'epic',
          'localField': 'proponent',
          'foreignField': '_id',
          'as': 'proponent'
        }
      },
      populateProponent && {
        '$unwind': '$proponent'
      },

      postQueryPipelineSteps,
      {
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
                      in: { $setIsSubset: [['$$fieldTag'], role] }
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
      },

      sortWarmUp, // Used to setup the sort if a temporary projection is needed.

      !_.isEmpty(sort) ? { $sort: sort } : null,

      sort ? { $project: projection } : null, // Reset the projection just in case the sortWarmUp changed it.

      // Do this only if they ask for it.
      count && {
        $group: {
          _id: null,
          total_items : { $sum : 1 },
          results: { $push: '$$ROOT' }
        }
      },
      count && {
        $project: {
          'total_items': 1,
          'results': {
            $slice: [
              '$results',
              skip,
              limit
            ]
          }
        }
      },
      !count &&{ $skip: skip || 0 },
      !count &&{ $limit: limit || MAX_LIMIT }
    ]);

    // Pre-pend the aggregation with other pipeline steps if we are joining on another datasource
    if (preQueryPipelineSteps && preQueryPipelineSteps.length > 0) {
      for (let step of preQueryPipelineSteps) {
        aggregations.unshift(step);
      }
    }

    let collation = {
      locale: 'en',
      strength: 2
    };

    theModel.aggregate(aggregations)
      .collation(collation)
      .exec()
      .then(resolve, reject);
  });
};

exports.filterData = function (collection, data, roles) {
  if (roles.includes('sysadmin') || roles.includes('staff')) {
    return data;
  }

  // We don't return these fields for non-admins.
  if (collection === 'Project') {
    _.each(data, function (item) {
      delete item.review180Start;
      delete item.review45Start;
      delete item.reviewSuspensions;
      delete item.reviewExtensions;
    });
    return data;
  } else if (collection === 'Organization') {
    _.each(data, function (item) {
      if (item.searchResults) {
        for (let organization in item.searchResults){
          delete item.searchResults[organization].description;
          delete item.searchResults[organization].postal;
          delete item.searchResults[organization].address1;
          delete item.searchResults[organization].address2;
        }
      }
    });
    return data;
  } else {
    return data;
  }
};

exports.attachFeaturedDocuments = async function (projects) {
  for(let itemIdx in projects) {
    let item = projects[itemIdx];
    // attach the featuredDocuments
    let featuredDocuments = await mongoose.model('Document').find({ project: item._id, isFeatured: true });
    if (featuredDocuments) {
      item.featuredDocuments = [];

      for(let docIdx in featuredDocuments) {
        let doc = featuredDocuments[docIdx];
        item.featuredDocuments.push(doc._id);
      }
    }
  }

  return projects;
};

// Generates all unique search terms up to a word limit.
exports.generateSearchTerms = function (name, maxWordLimit) {
  if (!name) {
    return;
  }

  let searchTerms = [];

  // Split the name into words.
  const words = name.trim().split(/\s+/);
  const wordLimit = words.length < maxWordLimit ? words.length : maxWordLimit;

  for (let i = 0; i < wordLimit; i++) {
    const wordTerms = getWordSearchTerms(words[i]);
    searchTerms = [...searchTerms, ...wordTerms];
  }

  // Remove any duplicate terms by casting to a set and then back to an array.
  const filteredTerms = [...new Set(searchTerms)];

  return filteredTerms;
};

// Gets all search terms for a single word.
const getWordSearchTerms = (word) => {
  const searchTerms = [];

  // Start terms at 2 letters in length. Do not want to search on single letter.
  for (let i = 2; i <= word.length; i++) {
    searchTerms.push(word.substring(0, i));
  }

  return searchTerms;
};
