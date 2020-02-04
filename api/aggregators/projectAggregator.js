const { setProjectDefault, unwindProjectData, addProjectLookupAggrs } = require('../helpers/aggregators');

/**
 * Creates aggregation required for projects.
 * 
 * @param {string} projectLegislation Project legislation year
 * @returns {array} Aggregation
 */
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

/**
 * Gets the correct legislation key for the year.
 * 
 * @param {string} legislation Project legislation year
 * @returns {object} Legislation key and ID
 */
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
