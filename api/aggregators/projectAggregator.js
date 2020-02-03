exports.createProjectAggr = (projectLegislation) => {
  let aggregation = [];

  //Get our project Legislation info. Need this for other spots in the code
  const { projectLegislationDataKey, projectLegislationDataIdKey } = getProjectLegislationInfo(projectLegislation);

  if (projectLegislation === "all") {
    projectLegislationDataKey.forEach ( dataKey => {  
      aggregation = addProjectLookupAggrs(dataKey);
    });
  } else if (!projectLegislation || projectLegislation === "default") {
    aggregation = setProjectDefault(true);
    // unwind proponents and move embedded data up to root
    const projectDataAggrs = unwindProjectData("default", "default._id", projectLegislation);
    aggregation = [...aggregation, ...projectDataAggrs];
  } else {
    aggregation = unwindProjectData(projectLegislationDataKey, projectLegislationDataIdKey, projectLegislation);
  }

  return aggregation;
};

const getProjectLegislationInfo = (legislation) => {
  let projectLegislationDataKey;
  switch (legislation) {
    //TODO: Update this to work for future years
    case "1996":
    case "2002":
    case "2018":
      projectLegislationDataKey = "legislation_" + legislation;
      break;
    case "all":
      //TODO: Make this extendable. Pull from a list
      projectLegislationDataKey = [ "legislation_1996", "legislation_2002", "legislation_2018" ];
      break;
    default:
      //TODO: need to know current legislation, to set proper default
      projectLegislationDataKey = "default";
      break;
    }

  return {projectLegislationDataKey, projectLegislationDataIdKey: projectLegislationDataKey + "._id"};
};

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
    }
  );

  // EA Decision lookup.
  aggregation.push(
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
    }
  );

  // phase name lookup
  aggregation.push(
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
  );

  // Proponent lookup.
  aggregation.push(
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
