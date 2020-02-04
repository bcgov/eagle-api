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


/**
 * Creates an aggregate of lookups for the desired legislation year.
 * 
 * @param {string} projectLegislationDataKey Legislation year key
 * @param {string} projectLegislationDataIdKey Legislation year key with ID
 * @param {string} projectLegislation Desired project year
 * @returns {array} Aggregate with the desired legislation year set
 */
 const unwindProjectData = (projectLegislationDataKey, projectLegislationDataIdKey, projectLegislation) => {
  const aggregation = addProjectLookupAggrs(projectLegislationDataKey);

  // If project legislation is missing then use the legislationDefault key on the project model
  // pop proponent if exists.
  if (!projectLegislation || projectLegislation == "default") {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + ".read"]: "$read",
          [projectLegislationDataKey + ".pins"]: "$pins",
          [projectLegislationDataKey + ".pinsHistory"]: "$pinsHistory",
          [projectLegislationDataKey + ".pinsRead"]: "$pinsRead"
        }
      }
    );
    
    aggregation.push(
      {
        "$replaceRoot": { newRoot:  "$" + projectLegislationDataKey }
      }
    );
  } else {
    aggregation.push(
      {
        '$addFields': {
          [projectLegislationDataIdKey]: '$_id',
          [projectLegislationDataKey + ".read"]: "$read",
          [projectLegislationDataKey + ".pins"]: "$pins",
          [projectLegislationDataKey + ".pinsHistory"]: "$pinsHistory"
        }
      }
    );

    aggregation.push(
      {
        "$addFields": {
          "project": { "$mergeObjects": ["$project",  "$" + projectLegislationDataKey]},
       }
      }
    );

    //Null out the projectLegislationYear
    aggregation.push({
      "$project": {["project.legislation_" + projectLegislation]: 0 }
    });

    aggregation.push({
      "$project": {[projectLegislationDataKey]: 0 }
    });
  }

  return aggregation;
};


/**
 * Creates an aggregate of the main fields that need to have a lookup occur on them.
 * 
 * @param {string} dataKey Legislation year key
 * @returns {array} Aggregate that unwinds the linked properties of a project
 */
 const addProjectLookupAggrs = (dataKey) => {
  const ceeaInvolvementField = `${dataKey}.CEAAInvolvement`;
  const eacDecisionField = `${dataKey}.eacDecision`;
  const proponentField = `${dataKey}.proponent`;
  const currentPhaseField = `${dataKey}.currentPhaseName`;
  const aggregation = [];

  // CEAA Involvement lookup.
  aggregation.push(
    {
      '$lookup': {
        'from': 'epic',
        'localField': ceeaInvolvementField,
        'foreignField': '_id',
        'as': ceeaInvolvementField
      }
    },
    {
      '$unwind': {
        path: `$${ceeaInvolvementField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': eacDecisionField,
        'foreignField': '_id',
        'as': eacDecisionField
      }
    },
    {
      '$unwind': {
        path: `$${eacDecisionField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': currentPhaseField,
        'foreignField': '_id',
        'as': currentPhaseField
      }
    },
    {
      '$unwind': {
        path: `$${currentPhaseField}`,
        preserveNullAndEmptyArrays: true
      }
    },
    {
      '$lookup': {
        'from': 'epic',
        'localField': proponentField,
        'foreignField': '_id',
        'as': proponentField
      }
    },
    {
      '$unwind': {
        path: `$${proponentField}`,
        preserveNullAndEmptyArrays: true
      }
    }
  );

  return aggregation;
};

// Exporting here so that the functions can be used in
// this file and exported.
exports.setProjectDefault = setProjectDefault;
exports.unwindProjectData = unwindProjectData;
exports.addProjectLookupAggrs = addProjectLookupAggrs;
