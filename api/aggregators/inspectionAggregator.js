exports.createInspectionAggr = (populate) => {
  let aggregation = [];

  if (populate) {
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

exports.createInspectionAggr = (populate) => {
  let aggregation = [];

  if (populate) {
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