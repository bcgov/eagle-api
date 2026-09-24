/**
 * Creates aggregation required for users.
 *
 * @param {boolean} populate Flag to unwind linked schemas
 * @returns {array} Aggregation
 */
exports.createUserAggr = (populate) => {
  const aggregation = [];

  aggregation.push(
    {
      '$lookup': {
        'from': 'epic',
        'localField': 'org',
        'foreignField': '_id',
        'as': 'org'
      }
    },
    {
      // Keep contacts with no organization; the admin shows '-' for them.
      '$unwind': {
        'path': '$org',
        'preserveNullAndEmptyArrays': true
      }
    },
  );

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
  }

  return aggregation;
};
