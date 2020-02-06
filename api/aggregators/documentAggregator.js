const { setProjectDefault } = require('../helpers/aggregators');

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
        "status": {
          $cond: {
            if: {
              // This way, if read isn't present, we assume public no roles array.
              $and: [
                { $cond: { if: "$read", then: true, else: false } },
                {
                  $anyElementTrue: {
                    $map: {
                      input: "$read",
                      as: "fieldTag",
                      in: { $setIsSubset: [["$$fieldTag"], ['public']] }
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

    // Here we have documents with a nested Project and a nested legislation key
    const defaultAggr = setProjectDefault(false);
    aggregation = [...aggregation, ...defaultAggr];

    // We need to merge the legislation key with the Project while preserving the _id and the rest of the document info
    // TODO: Abstract these types of stages, as we will need to do this a lot")
    aggregation.push(
      {
        "$addFields": {
          "project": { "$mergeObjects": ["$project", "$project.default"] },
        }
      },
      {
        "$project": {["project.legislation_2002"]: 0 }
      },
      {
        "$project": {["project.legislation_1996"]: 0 }
      },
      {
        "$project": {["project.default"]: 0 }
      }
    );

  }

  return aggregation;
};
