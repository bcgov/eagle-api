const _          = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const qs         = require('qs');
const Actions    = require('../helpers/actions');
const Utils      = require('../helpers/utils');

exports.getProjects = async function(sortBy, pageNumber, pageSize, query)
{

};

exports.getProject = async function(projectId)
{
    return mongoose.model('Project').findById(mongoose.Types.ObjectId(projectId));
}

exports.createProject = async function (project)
{

}

exports.updateProject = async function(sourceProject, updatedProject)
{

}

exports.deleteProject = async function(user, project)
{
    return Actions.delete(project).then(function (deleted) 
    {
      Utils.recordAction('Delete', 'Project', swagger.params.auth_payload.preferred_username, project.projId);

      return deleted;
    }, function (err) 
    {
      throw Error(err);
    });
}