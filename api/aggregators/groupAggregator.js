/**
 * Creates aggregation required for groups.
 *
 * @param {boolean} populate Flag to unwind linked schemas
 * @returns {array} Aggregation
 */
exports.createGroupAggr = (populate) => {
  const aggregation = [];

  // pop project and user if exists.
  aggregation.push(
    {
      '$lookup': {
        "from": "epic",
        "localField": "project",
        "foreignField": "_id",
        "as": "project"
      }
    },
    {
      "$unwind": "$project"
    }
  );

  if (populate) {
    // Handle project.
    aggregation.push(
      {
        "$lookup": {
          "from": "epic",
          "localField": "project",
          "foreignField": "_id",
          "as": "project"
        }
      },
      {
        "$addFields": {
          project: "$project",
        }
      },
      {
        "$unwind": {
          "path": "$project",
          "preserveNullAndEmptyArrays": true
        }
      }
    );
  }

  return aggregation;
};
