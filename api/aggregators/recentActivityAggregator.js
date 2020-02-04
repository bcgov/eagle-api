/**
 * Creates an aggregate for looking up recent activity.
 * 
 * @param {boolean} populate Flag indicating if fields need a look up
 * @returns {array} Aggregate for recent activity
 */
exports.createRecentActivityAggr = (populate) => {
  let aggregation = [];

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

/**
 * Creates an aggregation with the default project year set as the root.
 * 
 * @param {boolean} projectOnly Flag that indicates if the project should be set as root.
 * @returns {array} Aggregate with the default year set.
 */
const setProjectDefault = (projectOnly) => {
  const aggregation = [];

  if (projectOnly) {
    // variables are tricky for fieldpaths ie. "default"
    aggregation.push(
      {
        $addFields: {
          "default": {
            $switch: {
              branches: [
                { 
                  case: { $eq: [ "$currentLegislationYear", 'legislation_1996' ]},
                  then: "$legislation_1996"
                },
                {
                  case: { $eq: [ "$currentLegislationYear", 'legislation_2002' ]},
                  then: "$legislation_2002"
                },
                {
                  case: { $eq: [ "$currentLegislationYear", 'legislation_2018' ]},
                  then: "$legislation_2018"
                }
              ],
              default: "$legislation_2002"
            }
          }
        }
      }
    );
  } else {
    aggregation.push(
      {
        $addFields: {
          'project.default': {
            $switch: {
              branches: [
                { 
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_1996' ]},
                  then: "$project.legislation_1996"
                },
                {
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_2002' ]},
                  then: "$project.legislation_2002"
                },
                {
                  case: { $eq: [ "$project.currentLegislationYear", 'legislation_2018' ]},
                  then: "$project.legislation_2018"
                }
              //TODO: watch out for the default case. If we hit this then we will have empty projects
              ], default: "$project.legislation_2002"
            }
          }
        }
      }
    );
  }

  return aggregation;
};