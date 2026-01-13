const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const Actions    = require('../helpers/actions');
const Utils      = require('../helpers/utils');

const WORDS_TO_ANALYZE = 3;

exports.projectHateoas = function(project, roles) {
  project.links =
    [
      { rel: 'self', title: 'public self', type: 'GET', href: '/api/v2/Public/Projects/' + project._id },
      { rel: 'fetch', title: 'Public Project Pins List', type: 'GET', href: '/api/v2/Public/Projects/' + project._id + '/Pins' }
    ];

  if (roles && roles.length > 0 && (roles.includes('sysadmin') || roles.includes('staff'))) {
    project.links.push({ rel: 'self', title: 'secure self', method: 'GET', href: '/api/v2/Projects/' + project._id });
    project.links.push({ rel: 'update', title: 'Secure Project Update', method: 'PUT', href: '/api/v2/Projects/' + project._id });
    project.links.push({ rel: 'delete', title: 'Secure Project Delete', method: 'DELETE', href: '/api/v2/Projects/' + project._id });
    project.links.push({ rel: 'update', title: 'Secure Project Publish', method: 'PUT', href: '/api/v2/Projects/' + project._id + '/Publish' });
    project.links.push({ rel: 'update', title: 'Secure Project Un-Publish', method: 'PUT', href: '/api/v2/Projects/' + project._id + '/Unpublish' });
    project.links.push({ rel: 'fetch', title: 'Secure Project Pins List', method: 'GET', href: '/api/v2/Projects/' + project._id + '/Pins' });
    project.links.push({ rel: 'create', title: 'Secure Project Pins Create', method: 'POST', href: '/api/v2/Projects/' + project._id + '/Pins' });
    project.links.push({ rel: 'update', title: 'Secure Project Pins Publish', method: 'PUT', href: '/api/v2/Projects/' + project._id + '/Pins/Publish' });
    project.links.push({ rel: 'update', title: 'Secure Project Pins Unpublish', method: 'PUT', href: '/api/v2/Projects/' + project._id + '/Pins/Unpublish' });
    project.links.push({ rel: 'create', title: 'Secure Project Create Extensions', method: 'POST', href: '/api/v2/Projects/' + project._id + '/Extensions' });
    project.links.push({ rel: 'update', title: 'Secure Project Update Extensions', method: 'PUT', href: '/api/v2/Projects/' + project._id + '/Extensions' });
    project.links.push({ rel: 'delete', title: 'Secure Project Delete Extensions', method: 'DELETE', href: '/api/v2/Projects/' + project._id + '/Extensions' });
    project.links.push({ rel: 'create', title: 'Secure Project Create Groups', method: 'POST', href: '/api/v2/Projects/' + project._id + '/Groups' });
  }

  return project;
};

exports.getProjects = async function(roles, pageNumber, pageSize, sortBy, keywords) {
  let projectModel = mongoose.model('Project');
  let queryAggregates = [];

  // build aggregates
  // Order matters, both for an efficient query, and a correct one

  // First, filter on schema type, and make sure we only return existing, undeleted records
  queryAggregates.push(
    {
      $match:
      {
        _schemaName: 'Project',
        $or:
          [
            { isDeleted: { $exists: false } },
            { isDeleted: false },
          ]
      }
    });

  // Keywords
  if (keywords && keywords.length > 0) {
    queryAggregates.$match['$text'] =
        {
          $search: keywords,
          $caseSensitive: false
        };
  }

  // Predicates (and, or filters by KVP, map from query object)

  // Populate child objects (Need to test for performance, list objects don't normally return children, but we may need to)

  // Legislations
  queryAggregates.push(
    {
      $addFields:
      {
        default:
        {
          $switch:
          {
            branches:
            [
              {
                case:
                {
                  $eq: [ '$currentLegislationYear', 'legislation_1996' ]
                },
                then: '$legislation_1996'
              },
              {
                case:
                {
                  $eq: [ '$currentLegislationYear', 'legislation_2002' ]
                },
                then: '$legislation_2002'
              },
              {
                case:
                {
                  $eq: [ '$currentLegislationYear', 'legislation_2018' ]
                },
                then: '$legislation_2018'
              }
            ],
            default: '$legislation_2002'
          }
        }
      }
    });

  // lookups, unwinding, etc.
  queryAggregates.push(
    {
      $lookup:
      {
        from: 'epic',
        localField: 'default.CEAAInvolvement',
        foreignField: '_id',
        as: 'default.CEAAInvolvement'
      }
    });

  queryAggregates.push(
    {
      $unwind:
      {
        path: '$default.CEAAInvolvement',
        preserveNullAndEmptyArrays: true
      }
    });

  queryAggregates.push(
    {
      $lookup:
        {
          from: 'epic',
          localField: 'default.eacDecision',
          foreignField: '_id',
          as: 'default.eacDecision'
        }
    });

  queryAggregates.push(
    {
      $unwind:
        {
          path: '$default.eacDecision',
          preserveNullAndEmptyArrays: true
        }
    });

  queryAggregates.push(
    {
      $lookup:
        {
          from: 'epic',
          localField: 'default.proponent',
          foreignField: '_id',
          as: 'default.proponent'
        }
    });

  queryAggregates.push(
    {
      $unwind:
        {
          path: '$default.proponent',
          preserveNullAndEmptyArrays: true
        }
    });

  queryAggregates.push(
    {
      $addFields:
        {
          'default._id': '$_id',
          'default.read': '$read',
          'default.pins': '$pins',
          'default.pinsHistory': '$pinsHistory',
          'default.pinsRead': '$pinsRead',
          'default.projectCAC': '$projectCAC',
          'default.projectCACPublished': '$projectCACPublished',
          'default.cacEmail': '$cacEmail',
        }
    });

  // root
  queryAggregates.push(
    {
      $replaceRoot: { newRoot: '$default' }
    });

  // redact
  queryAggregates.push(
    {
      $redact:
      {
        $cond:
        {
          if:
          {
            $and:
            [
              {
                $cond:{ if: '$read', then: true, else: false }
              },
              {
                $anyElementTrue:
                {
                  $map:
                  {
                    input: '$read',
                    as: 'fieldTag',
                    in:
                    {
                      $setIsSubset:
                      [
                        [ '$$fieldTag' ],
                        [ 'public' ]
                      ]
                    }
                  }
                }
              }
            ]
          },
          then: '$$KEEP',
          else:
          {
            $cond: { if: '$read', then: '$$PRUNE', else: '$$DESCEND' }
          }
        }
      }
    });
  // Score - only add textScore when keywords are present (MongoDB 4.4+ requirement)
  if (keywords && keywords.length > 0) {
    queryAggregates.push(
      {
        $addFields: { score:{ $meta: 'textScore' } }
      });
  }

  let collation =
    {
      locale: 'en',
      strength: 2
    };

  // Sorting
  // loop through sortBy fields. a value of -1 = descending, 1 = ascending
  if(sortBy && sortBy.length > 1) {
    let $sort = {};

    const sortDirection = sortBy.charAt(0) == '-' ? -1 : 1;
    const sortField = sortBy.slice(1);

    $sort[sortField] = sortDirection;

    queryAggregates.push($sort);
  }

  // paging
  queryAggregates.push(
    {
      $facet:
        {
          searchResults:
            [
              { $skip: pageNumber * pageSize },
              { $limit: pageSize }
            ],
          meta:
            [ { $count: 'searchResultsTotal' } ]
        }
    });

  // execute the query aggregates
  let resultSet = await projectModel.aggregate(queryAggregates)
    .collation(collation)
    .exec();

  // sanitize based on roles
  resultSet = Utils.filterData('Project', resultSet, roles);

  // hateoas

  for(let projectIndex in resultSet[0].searchResults) {
    let project = resultSet[0].searchResults[projectIndex];

    project = this.projectHateoas(project, roles);
  }

  return resultSet;
};

exports.getProject = async function(roles, projectId) {
  let result = await mongoose.model('Project').findById(mongoose.Types.ObjectId(projectId));

  // sanitize based on roles. Return the first result
  // as we will only ever have one.
  result = Utils.filterData('Project', [result], roles)[0];

  return result;
};

exports.createProject = async function (user, project) {
  // default project creation is set to 2002 right now for backwards compatibility with other apps that use this api
  let projectLegislationYear = project.legislationYear ? project.legislationYear : 2002;

  let projectModel = mongoose.model('Project');
  let newProject;
  let projectData;

  if (projectLegislationYear == 2018) {
    newProject = new projectModel({legislation_2018: project});
    projectData = newProject.legislation_2018;
    projectData.legislation = '2018 Environmental Assessment Act';
  } else if (projectLegislationYear == 2002) {
    newProject = new projectModel({legislation_2002: project});
    projectData = newProject.legislation_2002;
    projectData.legislation = '2002 Environmental Assessment Act';
  } else if (projectLegislationYear == 1996) {
    newProject = new projectModel({legislation_1996: project});
    projectData = newProject.legislation_1996;
    projectData.legislation = '1996 Environmental Assessment Act';
  }

  if (!newProject) {
    throw Error('Failed to create new project from project model. Ensure provided Project matches the Project model.');
  }

  //Need to add this logic to the put because we will only hit a post on a net new project
  newProject.currentLegislationYear = 'legislation_' + projectLegislationYear;
  newProject.legislationYearList.push(projectLegislationYear);

  projectData.proponent = mongoose.Types.ObjectId(project.proponent);
  projectData.responsibleEPDId = mongoose.Types.ObjectId(project.responsibleEPDId);
  projectData.projectLeadId = mongoose.Types.ObjectId(project.projectLeadId);

  // Also need to make sure that the eacDecision and CEAAInvolvement fields are in the project. Hard requirement for public
  projectData.CEAAInvolvement = project.CEAAInvolvement ? project.CEAAInvolvement : null;
  projectData.eacDecision = project.eacDecision ? project.eacDecision : null;

  // Generate search terms for the name.
  projectData.nameSearchTerms = Utils.generateSearchTerms(project.name, WORDS_TO_ANALYZE);

  // Define security tag defaults
  newProject.read = ['sysadmin', 'staff'];
  newProject.write = ['sysadmin', 'staff'];
  newProject.delete = ['sysadmin', 'staff'];
  projectData._createdBy = user;
  projectData.createdDate = Date.now();

  if (projectLegislationYear == 2018) {
    newProject.legislation_2018 = projectData;
  } else if (projectLegislationYear == 2002) {
    newProject.legislation_2002 = projectData;
  } else if (projectLegislationYear == 1996) {
    newProject.legislation_1996 = projectData;
  }

  // Currently this will save based on the entire project model.
  // Meaning there will be three project legislation keys ( legislation_1996, legislation_2002, legislation_2018) only one of which will be populated with data.
  // The other two keys will be full of null values, as well as any other fields that are in the project model and are not explicitly defined above.
  return newProject.save()
    .then(function (createdProject) {
      Utils.recordAction('Post', 'Project', user, createdProject._id);

      return createdProject;
    })
    .catch(function (err) {
      throw Error('Failed to create project: ', err);
    });
};

exports.updateProject = async function(user, sourceProject, updatedProject) {
  let projectLegislationYear;
  let filteredData;

  // if project legislation doesn't exist then look up current legislation for the project
  if (updatedProject.legislationYear) {
    projectLegislationYear = updatedProject.legislationYear;
    // check if the passed in project year exists in the legislation year list
    if (!sourceProject.legislationYearList.includes(projectLegislationYear)) {
      sourceProject.legislationYearList.push(projectLegislationYear);
    }
  } else {
    // look up the current project legislation
    projectLegislationYear = sourceProject.currentLegislationYear.split('_')[1];
  }

  if (projectLegislationYear == 2018) {
    filteredData = sourceProject.legislation_2018;
    filteredData.legislation = '2018 Environmental Assessment Act';
  } else if (projectLegislationYear == 2002) {
    filteredData = sourceProject.legislation_2002;
    filteredData.legislation = '2002 Environmental Assessment Act';
  } else if (projectLegislationYear == 1996) {
    filteredData = sourceProject.legislation_1996;
    filteredData.legislation = '1996 Environmental Assessment Act';
  }

  if (!filteredData) {
    defaultLog.info('Couldn\'t find that object!');
    throw new Error('Couldn\'t find correct project legislation');
  }

  delete updatedProject.read;
  delete updatedProject.write;
  delete updatedProject.delete;

  filteredData.type              = updatedProject.type;
  filteredData.build             = updatedProject.build;
  filteredData.sector            = updatedProject.sector;
  filteredData.description       = updatedProject.description;
  filteredData.location          = updatedProject.location;
  filteredData.region            = updatedProject.region;
  filteredData.status            = updatedProject.status;
  filteredData.eaStatus          = updatedProject.eaStatus;
  filteredData.name              = updatedProject.name;
  filteredData.substantiallyDate = updatedProject.substantiallyDate;
  filteredData.eaStatusDate      = updatedProject.eaStatusDate;
  // Updating the legislation Year in the legislation key
  filteredData.legislationYear   = projectLegislationYear;
  filteredData.substantially     = updatedProject.substantially;
  filteredData.dispute           = updatedProject.dispute;
  filteredData.disputeDate       = updatedProject.disputeDate;
  filteredData.centroid          = updatedProject.centroid;
  // Contacts
  filteredData.projectLeadId     = mongoose.Types.ObjectId(updatedProject.projectLeadId);
  filteredData.responsibleEPDId  = mongoose.Types.ObjectId(updatedProject.responsibleEPDId);
  // CEAA
  filteredData.CEAAInvolvement   = updatedProject.CEAAInvolvement;
  filteredData.CEAALink          = updatedProject.CEAALink;
  filteredData.eacDecision       = updatedProject.eacDecision;
  filteredData.decisionDate      = updatedProject.decisionDate ? new Date(updatedProject.decisionDate) : null;
  sourceProject.review45Start    = updatedProject.review45Start  ? new Date(updatedProject.review45Start) : null;
  sourceProject.review180Start   = updatedProject.review180Start  ? new Date(updatedProject.review180Start) : null;

  filteredData.nameSearchTerms = Utils.generateSearchTerms(updatedProject.name, WORDS_TO_ANALYZE);

  try {
    filteredData.intake = {};
    filteredData.intake.investment = updatedProject.intake.investment;
    filteredData.intake.investmentNotes = updatedProject.intake.notes;
  } catch (e) {
    // Missing info
    console.log('Missing:', e);
    // fall through
  }
  filteredData.proponent = updatedProject.proponent;

  if (projectLegislationYear == 2018) {
    sourceProject.legislation_2018 = filteredData;
  } else if (projectLegislationYear == 2002) {
    sourceProject.legislation_2002 = filteredData;
  } else if (projectLegislationYear == 1996) {
    sourceProject.legislation_1996 = filteredData;
  }

  var doc = await mongoose.model('Project').findOneAndUpdate({ _id: mongoose.Types.ObjectId(sourceProject._id) }, sourceProject, { upsert: false, new: true });
  // Project.update({ _id: mongoose.Types.ObjectId(objId) }, { $set: updateObj }, function (err, o) {
  if (doc) {
    Utils.recordAction('Put', 'Project', user, doc._id);
  } else {
    defaultLog.info('Couldn\'t find that object!');
    throw Error('Failed to update project');
  }

  return doc;
};

exports.deleteProject = async function(user, project) {
  return Actions.delete(project).then(function (deleted) {
    Utils.recordAction('Delete', 'Project', user, project.projId);

    return deleted;
  }, function (err) {
    throw Error('Failed to delete project: ', err);
  });
};

exports.publishProject = async function(user, project) {
  if (project && project.legislationYear) {
    project.currentLegislationYear = 'legislation_' + project.legislationYear;
  }

  return Actions.publish(project, true)
    .then(function (published) {
      Utils.recordAction('Publish', 'Project', user, project._id);

      return published;
    })
    .catch(function (err) {
      throw Error('Failed to publish project', err);
    });
};

exports.unPublishProject = async function(user, project) {
  return Actions.unPublish(project, true)
    .then(function (unpublished) {
      Utils.recordAction('Put', 'Unpublish', user, project._id);

      return unpublished;
    })
    .catch(function (err) {
      throw Error('Failed to unpublish project', err);
    });
};

exports.addExtension = async function(user, extension, project) {
  let extensionType = extension.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

  try {
    let data = await mongoose.model('Project').update(
      { _id: project._id },
      { $push: { [extensionType]: extension } },
      { new: true }
    );

    if (data.nModified === 0) {
      throw Error('Project extensions could not be modified');
    }

    Utils.recordAction('Post', 'Extension', user, project._id);

    return data;
  } catch (e) {
    console.log(e);
    throw Error('Project extension could not be added: ', e);
  }
};

exports.updateExtension = async function(user, extension, project) {
  let extensionNew = extension.new;
  let extensionOld = extension.old;
  let extensionOldType = extensionOld.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';
  let extensionNewType = extensionNew.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

  let projectModel = mongoose.model('Project');

  try {
    let dataRemoved = await projectModel.update(
      { _id: project._id },
      { $pull: { [extensionOldType]: extensionOld } },
      { new: true }
    );

    if (dataRemoved.nModified === 0) {
      throw Error('Project extensions could not be modified');
    }

    let dataAdded = await projectModel.update(
      { _id: project._id },
      { $push: { [extensionNewType]: extensionNew } },
      { new: true }
    );

    if (dataAdded.nModified === 0) {
      throw Error('Project extensions could not be modified');
    }

    Utils.recordAction('Put', 'Extension', user, project._id);

    return dataAdded;
  } catch (e) {
    throw Error('Project extension could not be updated: ', e);
  }
};

exports.deleteExtension = async function(user, extension, project) {
  try {
    let extensionType = extension.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

    let projectModel = mongoose.model('Project');

    let data = await projectModel.update(
      { _id: project._id },
      { $pull: { [extensionType]: extension } },
      { new: true }
    );

    if (data.nModified === 0) {
      throw Error('Project extensions could not be modified');
    }

    Utils.recordAction('Delete', 'Extension', user, project._id);
    return data;
  } catch (e) {
    throw Error('Project extension could not be deleted: ', e);
  }
};