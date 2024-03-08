const { setProjectDefault } = require('../helpers/aggregators');

/**
 * Creates an aggregate for looking up recent activity.
 *
 * @param {boolean} populate Flag indicating if fields need a look up
 * @returns {array} Aggregate for recent activity
 */
exports.createCommentPeriodAggr = (populate) => {
  let aggregation = [];

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
        '$project': { ['project.legislation_2002']: 0 }
      },
      {
        '$project': { ['project.legislation_1996']: 0 }
      },
      {
        '$project': { ['project.default']: 0 }
      },
      {
        '$lookup': {
          from: 'epic',
          localField: 'project.currentPhaseName',
          foreignField: '_id',
          as: 'project.currentPhaseName'
        }
      },
      {
        '$unwind': {
          path: '$project.currentPhaseName',
          preserveNullAndEmptyArrays: true
        }
      }
    );
  }

  return aggregation;
};
