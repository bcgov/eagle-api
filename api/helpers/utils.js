'use strict';

var mongoose        = require('mongoose');
var NodeClam        = require('clamscan');
var MAX_LIMIT       = 1000;
const defaultLog      = require('winston').loggers.get('default');
var DEFAULT_PAGESIZE  = 25;
var MAX_PAGESIZE      = 500;

// ClamAV scanner instance (initialized on first use)
let clamScanner = null;

/**
 * Get or initialize the ClamAV scanner instance.
 * Uses TCP connection to remote ClamAV daemon.
 */
async function getClamScanner() {
  if (clamScanner) {
    return clamScanner;
  }

  const serviceHost = process.env.CLAMAV_SERVICE_HOST || '127.0.0.1';
  const servicePort = parseInt(process.env.CLAMAV_SERVICE_PORT, 10) || 3310;

  try {
    clamScanner = await new NodeClam().init({
      debugMode: false,
      clamdscan: {
        host: serviceHost,
        port: servicePort,
        timeout: 60000,
        localFallback: false,
        active: true,
      },
      clamscan: {
        active: false,  // Don't use local binary
      },
      preference: 'clamdscan',
    });
    defaultLog.info(`ClamAV scanner initialized: ${serviceHost}:${servicePort}`);
    return clamScanner;
  } catch (err) {
    defaultLog.error(`Failed to initialize ClamAV scanner: ${err.message}`);
    throw err;
  }
}

exports.buildQuery = function (property, values, query) {
  query = query || {};
  var oids = [];
  if (Array.isArray(values)) {
    values.forEach(function (i) {
      if (mongoose.Types.ObjectId.isValid(i)) {
        oids.push(new mongoose.Types.ObjectId(i));
      }
    });
  } else {
    if (mongoose.Types.ObjectId.isValid(values)) {
      oids.push(new mongoose.Types.ObjectId(values));
    }
  }
  return Object.assign(query, { [property]: {
    $in: oids
  }
  });
};

/**
 * Filter a fields array against an allowlist.
 * Replaces the repeated local getSanitizedFields pattern in every controller.
 */
exports.sanitizeFields = function (fields, allowedList) {
  if (!Array.isArray(fields)) return [];
  return fields.filter(f => allowedList.includes(f));
};

/**
 * Extract and validate a Mongoose ObjectId from a swagger param.
 * Returns a mongoose.Types.ObjectId or null.
 * Throws { status: 400 } when the value is present but invalid.
 */
exports.getValidObjectId = function (param) {
  const val = param && param.value;
  if (!val) return null;
  if (!mongoose.Types.ObjectId.isValid(val)) {
    const err = new Error('Invalid ObjectId');
    err.status = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(val);
};

exports.getBasePath = function (protocol, host) {
  return protocol + '://' + host;
};

/**
 * Scan a buffer for viruses using ClamAV.
 * @param {Buffer} buffer - The file buffer to scan
 * @returns {Promise<boolean>} - true if file is clean, false if infected or error
 */
exports.avScan = async function (buffer) {
  const stream = require('stream');
  const serviceHost = process.env.CLAMAV_SERVICE_HOST || '127.0.0.1';
  const servicePort = process.env.CLAMAV_SERVICE_PORT || '3310';

  try {
    const clam = await getClamScanner();

    // Create a readable stream from the buffer
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const { isInfected, viruses } = await clam.scanStream(bufferStream);

    if (isInfected) {
      defaultLog.warn(`File is infected with: ${viruses.join(', ')}`);
      return false;
    }

    defaultLog.info('File passed virus scan');
    return true;
  } catch (err) {
    defaultLog.warn(`ClamAV service: ${serviceHost}:${servicePort} scan failed: ${err.message}`);
    // Reset scanner instance on error so it can be re-initialized
    clamScanner = null;
    return false;
  }
};

exports.getSkipLimitParameters = function (pageSize, pageNum) {
  const params = {};

  var ps = DEFAULT_PAGESIZE; // Default
  if (pageSize && pageSize.value !== undefined) {
    if (pageSize.value > 0) {
      ps = Math.min(pageSize.value, MAX_PAGESIZE);
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
    defaultFields.forEach(function (f) {
      projection[f] = 1;
    });

    // Add requested fields - sanitize first by including only those that we can/want to return
    if (Array.isArray(fields)) {
      fields.forEach(function (f) {
        projection[f] = 1;
      });
    }

    var aggregations = [
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
      // Populate Recent Activity PCP and projectNotification (RecentActivity only)
      (modelType === 'RecentActivity') && {
        '$lookup': {
          'from': 'epic',
          'localField': 'pcp',
          'foreignField': '_id',
          'as': 'pcp'
        }
      },
      (modelType === 'RecentActivity') && {
        '$unwind': {
          'path': '$pcp',
          'preserveNullAndEmptyArrays': true
        }
      },
      (modelType === 'RecentActivity') && {
        '$lookup': {
          'from': 'epic',
          'localField': 'project._id',
          'foreignField': '_id',
          'as': 'projectNotification'
        }
      },
      (modelType === 'RecentActivity') && {
        '$unwind': {
          'path': '$projectNotification',
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
        '$unwind': {
          'path': '$proponent',
          'preserveNullAndEmptyArrays': true
        }
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
              $cond: { if: '$read', then: '$$PRUNE', else: '$$PRUNE' }
            }
          }
        }
      },

      sortWarmUp, // Used to setup the sort if a temporary projection is needed.

      (sort && Object.keys(sort).length > 0) ? { $sort: sort } : null,

      sort ? { $project: projection } : null, // Reset the projection just in case the sortWarmUp changed it.

      // Do this only if they ask for it.
      // $facet runs count and pagination in parallel without materializing the
      // full result set into memory (replaces the old $group+$push+$slice pattern).
      count && {
        $facet: {
          total_items: [{ $count: 'total_items' }],
          results: [
            skip != null ? { $skip: skip } : null,
            { $limit: limit || MAX_LIMIT }
          ].filter(Boolean)
        }
      },
      // Unwrap the count array produced by $facet into a plain number.
      count && {
        $addFields: {
          total_items: { $ifNull: [{ $arrayElemAt: ['$total_items.total_items', 0] }, 0] }
        }
      },
      !count &&{ $skip: skip || 0 },
      !count &&{ $limit: limit || MAX_LIMIT }
    ].filter(Boolean);

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
    data.forEach(function (item) {
      delete item.review180Start;
      delete item.review45Start;
      delete item.reviewSuspensions;
      delete item.reviewExtensions;
    });
    return data;
  } else if (collection === 'Organization') {
    data.forEach(function (item) {
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

/**
 * Fetch a URL and return it as a Node Readable stream.
 * @param {string} url - The URL to fetch
 * @returns {Promise<import('stream').Readable>}
 */
exports.getUrlAsStream = async function (url) {
  const { Readable } = require('stream');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url}, status: ${response.status}`);
  }
  return Readable.fromWeb(response.body);
};

