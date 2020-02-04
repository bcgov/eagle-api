/**
 * Creates an aggregate for an inspection.
 * 
 * @param {boolean} populate Flag indicating if fields need a look up
 * @returns {array} Aggregate for inspections
 */
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

/**
 * Creates an aggregate for an inspection element
 * 
 * @param {boolean} populate Flag indicating if fields need a look up
 * @returns {array} Aggregate for inspection elements
 */
exports.createInspectionElementAggr = (populate) => {
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