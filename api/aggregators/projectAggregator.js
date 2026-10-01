const { setProjectDefault, unwindProjectData, addProjectLookupAggrs } = require('../helpers/aggregators');
const { LEGISLATIONS, LEGISLATION_KEYS } = require('../helpers/constants');

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

  if (projectLegislation === 'all') {
    projectLegislationDataKey.forEach ( dataKey => {
      aggregation = addProjectLookupAggrs(aggregation, dataKey);
    });
  } else if (!projectLegislation || projectLegislation === 'default') {
    aggregation = setProjectDefault(true);
    // unwind proponents and move embedded data up to root
    const projectDataAggrs = unwindProjectData('default', 'default._id', projectLegislation);
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
  if (Object.keys(LEGISLATIONS).includes(legislation)) {
    projectLegislationDataKey = 'legislation_' + legislation;
  } else if (legislation === 'all') {
    projectLegislationDataKey = LEGISLATION_KEYS;
  } else {
    //TODO: need to know current legislation, to set proper default
    projectLegislationDataKey = 'default';
  }

  return {projectLegislationDataKey, projectLegislationDataIdKey: projectLegislationDataKey + '._id'};
};
