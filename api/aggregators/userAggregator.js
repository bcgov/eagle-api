exports.createUserAggr = (populate) => {
  const aggregation = [];

  aggregation.push(
    {
      '$lookup': {
        "from": "epic",
        "localField": "org",
        "foreignField": "_id",
        "as": "org"
      }
    },
    {
      "$unwind": "$org"
    },
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
