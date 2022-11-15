const { setProjectDefault } = require('../helpers/aggregators');
const mongoose = require('mongoose');

const aggregateHelper = require('../helpers/aggregators');

/**
 * Create an aggregation that sets the matching criteria for a document search.
 *
 * @param {string} schemaName Schema being searched on
 * @param {string} projectId Project ID
 * @param {string} keywords List of keywords to search on
 * @param {boolean} caseSensitive Case sensitive search?
 * @param {array} orModifier Search criteria for an 'or' search
 * @param {array} andModifier Search criteria for an 'and' search
 * @param {array} roles User's roles
 *
 * @returns {array} Aggregation for a document match
 */
exports.createMatchAggr = async (schemaName, projectId, keywords, caseSensitive, orModifier, andModifier, categorized, roles) => {
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
  const andExpArray = await aggregateHelper.generateExpArray(andModifier, roles, schemaName);

  // filters
  const orExpArray = await aggregateHelper.generateExpArray(orModifier, roles, schemaName);

  let modifier = {};
  if (andExpArray.length > 0 && orExpArray.length > 0) {
    modifier = { $and: [{ $and: andExpArray }, { $or: orExpArray }] };
  } else if (andExpArray.length === 0 && orExpArray.length > 0) {
    modifier = { $and: orExpArray };
  } else if (andExpArray.length > 0 && orExpArray.length === 0) {
    modifier = { $and: andExpArray };
  }

  // Create aggregate for uncategorized or categorized documents.
  // If the flag is missing then all documents will be returned.
  let deletedModifier = {
    $or: [
      { isDeleted: { $exists: false } },
      { isDeleted: false },
    ]
  };
  let categorizedModifier;
  if (categorized === true) {
    categorizedModifier = {
      type: { $nin: [null, ''] },
      milestone: { $nin: [null, ''] },
      documentAuthorType: { $nin: [null, ''] },
    };
  } else if (categorized === false) {
    deletedModifier = {
      $and: [
        {
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false },
          ]
        },
        {
          $or: [
            { type: { $in: [null, ''] } },
            { milestone: { $in: [null, ''] } },
            { documentAuthorType: { $in: [null, ''] } },
          ]
        }
      ]
    };

    // Must combine the two 'and' clauses otherwise they will override each other.
    deletedModifier = {
      $and: [
        ...deletedModifier.$and,
        ...modifier.$and
      ]
    };
  }

  aggregation.push({
    $match: {
      _schemaName: schemaName,
      ...(aggregateHelper.isEmpty(modifier) ? undefined : modifier),
      ...(projectModifier ? projectModifier : undefined),
      ...(keywordModifier ? keywordModifier : undefined),
      ...(categorizedModifier && categorized === true ? categorizedModifier : undefined),
      ...deletedModifier,
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
              { $cond: { if: '$read', then: true, else: false } },
              {
                $anyElementTrue: {
                  $map: {
                    input: '$read',
                    as: 'fieldTag',
                    in: { $setIsSubset: [['$$fieldTag'], roles] }
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
    {
      $addFields: {
        score: { $meta: 'textScore' }
      }
    }
  );

  return aggregation;
};

/**
 * Creates an aggregation for documents.
 *
 * @param {boolean} populate Flag to create lookups
 * @param {array} roles Set of user roles
 * @returns {array} Aggregate for documents.
 */
exports.createDocumentAggr = (populate, roles) => {
  let aggregation = [];

  // Allow documents to be sorted by status based on publish existence
  aggregation.push(
    {
      $addFields: {
        'status': {
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
                      in: { $setIsSubset: [['$$fieldTag'], ['public']] }
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

  // if we're coming in from the public endpoint, and we're fetching documents,
  // we MUST add a match to enforce eaoStatus='Published', regardless of filter
  // ensure this occurs after the main filters

  if(roles && roles.length === 1 && roles.includes('public')) {
    aggregation.push({
      $match: {
        status: 'published'
      }
    });
  }

  if (populate) {
    // Handle project.
    aggregation.push(
      {
        '$lookup': {
          'from': 'epic',
          'localField': 'project',
          'foreignField': '_id',
          'as': 'project'
        }
      },
      {
        '$addFields': {
          project: '$project',
        }
      },
      {
        '$unwind': {
          'path': '$project',
          'preserveNullAndEmptyArrays': true
        }
      }
    );

    // Here we have documents with a nested Project and a nested legislation key
    const defaultAggr = setProjectDefault(false);
    aggregation = [...aggregation, ...defaultAggr];

    // We need to merge the legislation key with the Project while preserving the _id and the rest of the document info
    // TODO: Abstract these types of stages, as we will need to do this a lot")
    aggregation.push(
      {
        '$addFields': {
          'project': { '$mergeObjects': ['$project', '$project.default'] },
        }
      },
      {
        '$project': {['project.legislation_2002']: 0 }
      },
      {
        '$project': {['project.legislation_1996']: 0 }
      },
      {
        '$project': {['project.default']: 0 }
      },
      {
        '$lookup': {
          from: 'epic',
          localField: 'project.proponent',
          foreignField: '_id',
          as: 'project.proponent'
        }
      },
      {
        '$unwind': {
          path: '$project.proponent',
          preserveNullAndEmptyArrays: true
        }
      }
    );

  }

  return aggregation;
};
