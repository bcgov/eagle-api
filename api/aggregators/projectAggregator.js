const {
  setProjectDefault,
  unwindProjectData,
  addProjectLookupAggrs,
  createUpdatedInLast30daysAggr
} = require('../helpers/aggregators');
const constants = require('../helpers/constants').schemaTypes;


/**
 * Creates aggregation required for projects.
 *
 * @param {string} projectLegislation Project legislation year
 * @returns {array} Aggregation
 */
exports.createProjectAggr = (projectLegislation, changedInLast30days) => {
  let aggregation = [];

  //Get our project Legislation info. Need this for other spots in the code
  const { projectLegislationDataKey, projectLegislationDataIdKey } = getProjectLegislationInfo(projectLegislation);

  if (projectLegislation === 'all') {
    projectLegislationDataKey.forEach(dataKey => {
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
  if (changedInLast30days !== undefined) {
    const updatedIn30daysAggr = createUpdatedInLast30daysAggr(constants.PROJECT);
    aggregation = [...aggregation, ...updatedIn30daysAggr];
  }

  return aggregation;
};

/**
 * Gets the correct legislation key for the year.
 *
 * @param {string} legislation Project legislation year
 * @returns {object} Legislation key and ID
 */
const getProjectLegislationInfo = legislation => {
  let projectLegislationDataKey;
  switch (legislation) {
    //TODO: Update this to work for future years
    case '1996':
    case '2002':
    case '2018':
      projectLegislationDataKey = 'legislation_' + legislation;
      break;
    case 'all':
      //TODO: Make this extendable. Pull from a list
      projectLegislationDataKey = ['legislation_1996', 'legislation_2002', 'legislation_2018'];
      break;
    default:
      //TODO: need to know current legislation, to set proper default
      projectLegislationDataKey = 'default';
      break;
  }

  return { projectLegislationDataKey, projectLegislationDataIdKey: projectLegislationDataKey + '._id' };
};

exports.addUpdatedInLast30daysAggr = () => {
  const in30days = new Date();
  in30days.setDate(in30days.getDate() - 30);

  const aggregation = [];
  aggregation.push(
    {
      $addFields: {
        dateAdded: {
          $cond: {
            if: {
              $eq: ['$dateAdded', '']
            },
            then: null,
            else: {
              $dateFromString: {
                dateString: '$dateAdded'
              }
            }
          }
        }
      }
    },
    {
      $match: {
        $or: [
          {
            dateUpdated: {
              $gte: in30days
            }
          },
          {
            dateAdded: {
              $gte: in30days
            }
          }
        ]
      }
    }
  );
  return aggregation;
};
