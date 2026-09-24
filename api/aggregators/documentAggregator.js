const { setProjectDefault } = require('../helpers/aggregators');
const mongoose = require('mongoose');
const qs = require('qs');

const aggregateHelper = require('../helpers/aggregators');
const { parentReadMatch } = require('../helpers/parentRead');
const { IMAGE_SOURCE } = require('../helpers/updateRules');

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
  let hasTextSearch = false;

  if (projectId) {
    projectModifier = { project: new mongoose.Types.ObjectId(projectId) };
  }

  if (keywords) {
    keywordModifier = { $text: { $search: "\""+keywords+"\"", $caseSensitive: caseSensitive} };
    hasTextSearch = true;
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

  // Update form images belong to their Update, not the document lists, unless a signed-in caller asks
  // for a source. A scheduled Update's images are public before it is live, so the public never gets them here.
  const signedIn = Array.isArray(roles) && roles.some(role => role !== 'public');
  const asksForSource = [andModifier, orModifier].some(m => Object.keys(qs.parse(m)).includes('documentSource'));
  const sourceModifier = asksForSource && signedIn
    ? undefined
    : { documentSource: { $ne: IMAGE_SOURCE } };

  aggregation.push({
    $match: {
      _schemaName: schemaName,
      ...(aggregateHelper.isEmpty(modifier) ? undefined : modifier),
      ...sourceModifier,
      ...(projectModifier ? projectModifier : undefined),
      ...(keywordModifier ? keywordModifier : undefined),
      ...(categorizedModifier && categorized === true ? categorizedModifier : undefined),
      ...deletedModifier,
    }
  });

  // Ensure 'public' is always included in roles for permission checks
  // Authenticated users should still see publicly available content
  const rolesWithPublic = roles.includes('public') ? roles : [...roles, 'public'];

  // Check document permissions using a flat $match for performance instead of recursive $redact.
  aggregation.push({
    $match: {
      $or: [
        { read: { $exists: false } },
        { read: { $size: 0 } },
        { read: { $in: rolesWithPublic } }
      ]
    }
  });

  // Only add textScore when a $text search is present (MongoDB 4.4+ requirement)
  if (hasTextSearch) {
    aggregation.push({
      $addFields: {
        score: { $meta: 'textScore' }
      }
    });
  }

  return aggregation;
};

// Document fields holding a List id; the admin tables show the List name, so they sort by it.
const LIST_LABEL_FIELDS = ['type', 'milestone'];
const SORT_RANK_ROOT = '_sortRank';

// Shapes a joined `project` as Document rows show it: default legislation merged in, proponent joined.
const projectShapeStages = () => [
  ...setProjectDefault(false),
  // We need to merge the legislation key with the Project while preserving the _id and the rest of the document info
  {
    '$addFields': {
      'project': {
        '$cond': {
          if: '$project._id',
          then: { '$mergeObjects': ['$project', { '$ifNull': ['$project.default', {}] }] },
          else: null
        }
      }
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
];

// Ids grouped by sort value in ascending order; ids whose value is null or missing are left out.
const groupIdsByValue = (modelName, shapeStages, valuePath, idPath) => mongoose.model(modelName)
  .aggregate([
    { $match: { _schemaName: modelName } },
    ...shapeStages,
    { $group: { _id: { $ifNull: [`$${valuePath}`, null] }, ids: { $push: `$${idPath}` } } },
    { $match: { _id: { $ne: null } } },
    { $sort: { _id: 1 } }
  ])
  .collation({ locale: 'en', strength: 2 })
  .exec();

const rankGroups = (key, populate) => {
  if (LIST_LABEL_FIELDS.includes(key)) {
    return { idField: key, groups: groupIdsByValue('List', [], 'name', '_id') };
  }
  // Without populate, project stays an id and a project.* sort has nothing to compare.
  if (populate && key.startsWith('project.')) {
    const shape = [{ $replaceRoot: { newRoot: { project: '$$ROOT' } } }, ...projectShapeStages()];
    return { idField: 'project', groups: groupIdsByValue('Project', shape, key, 'project._id') };
  }
  return null;
};

// ponytail: rank arrays hold every List item or Project; cache them if those collections reach tens of thousands.
// Rank of the row's id among the groups; equal values share a rank, an unknown id ranks lowest.
const rankExpression = (groups, idField) => {
  const ids = groups.flatMap(group => group.ids);
  const ranks = groups.flatMap((group, rank) => group.ids.map(() => rank));
  return {
    $let: {
      vars: { at: { $indexOfArray: [ids, `$${idField}`] } },
      in: { $cond: [{ $lt: ['$$at', 0] }, -1, { $arrayElemAt: [ranks, '$$at'] }] }
    }
  };
};

/** Swaps a sort on a List label or joined project field for a prefetched rank, so the page is cut before any join. */
const withSortRanks = async (pagingAggregation, populate) => {
  const [facetStage, ...rest] = pagingAggregation;
  const { searchResults } = facetStage.$facet;
  const sortStage = searchResults.find(stage => stage.$sort);
  const ranked = sortStage
    ? Object.keys(sortStage.$sort).map(key => ({ key, rank: rankGroups(key, populate) })).filter(({ rank }) => rank)
    : [];
  if (ranked.length === 0) {
    return pagingAggregation;
  }

  const rankField = key => `${SORT_RANK_ROOT}.${key}`;
  const rankedKeys = ranked.map(({ key }) => key);
  const sort = Object.fromEntries(Object.entries(sortStage.$sort)
    .map(([key, direction]) => [rankedKeys.includes(key) ? rankField(key) : key, direction]));
  const groups = await Promise.all(ranked.map(({ rank }) => rank.groups));
  const rankFields = Object.fromEntries(ranked.map(({ key, rank }, i) => [rankField(key), rankExpression(groups[i], rank.idField)]));

  return [
    { $addFields: rankFields },
    {
      $facet: {
        ...facetStage.$facet,
        searchResults: [...searchResults.map(stage => (stage === sortStage ? { $sort: sort } : stage)), { $unset: SORT_RANK_ROOT }]
      }
    },
    ...rest
  ];
};

/**
 * Creates an aggregation for documents.
 *
 * @param {boolean} populate Flag to create lookups
 * @param {array} roles Set of user roles
 * @param {array} unreadableParentIds Parents the caller cannot read, from helpers/parentRead
 * @returns {array} Aggregate for documents.
 */
exports.createDocumentAggr = async (populate, roles, sortingValue, sortField, sortDirection, pageNum, pageSize, unreadableParentIds) => {
  // Runs whether or not the caller asked to populate, and before the project lookup below
  // overwrites the `project` reference the gate reads.
  let aggregation = [...parentReadMatch(unreadableParentIds)];

  // Allow documents to be sorted by status based on publish existence
  aggregation.push(
    {
      $addFields: {
        'status': {
          $cond: {
            if: {
              $and: [
                { $cond: { if: '$read', then: true, else: false } },
                { $in: ['public', '$read'] }
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
  const sortAggregation = await withSortRanks(
    aggregateHelper.createSortingPagingAggr('Document', sortingValue, sortField, sortDirection, pageNum, pageSize), populate);
  aggregation = [...aggregation, ...sortAggregation];

  if (populate) {
    //Handle project.
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
          'project': '$project',
        }
      },
      {
        '$unwind': {
          'path': '$project',
          'preserveNullAndEmptyArrays': true
        }
      },
      // Here we have documents with a nested Project and a nested legislation key
      ...projectShapeStages()
    );
  }

  return aggregation;
};
