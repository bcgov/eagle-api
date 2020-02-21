// Imports
const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');
const constants  = require('../helpers/constants');

async function getProjectHandler(roles, params)
{
  let data = {};

  // fetch a project, or a list of projects
  if (Object.prototype.hasOwnProperty.call(params, "projId"))
  {
    let projectId = params.projId.value;
        
    defaultLog.debug(' Fetching project ' + projectId);
    data = await projectDAO.getProject(roles, projectId);
    data = projectDAO.projectHateoas(data, roles);
  }
  else
  {
    let pageNumber = Object.prototype.hasOwnProperty.call(params,'pageNumber') && params.pageNumber.value ? params.pageNumber.value : 1;
    let pageSize   = Object.prototype.hasOwnProperty.call(params,'pageSize')   && params.pageSize.value   ? params.pageSize.value   : 10;
    let sortBy     = Object.prototype.hasOwnProperty.call(params,'sortBy')     && params.sortBy.value     ? params.sortBy.value     : '';
    let query      = Object.prototype.hasOwnProperty.call(params,'query')      && params.query.value      ? params.query.value      : '';
    let keywords   = Object.prototype.hasOwnProperty.call(params,'keywords')   && params.keywords.value   ? params.keywords.value   : '';

    data = await projectDAO.getProjects(roles, pageNumber, pageSize, sortBy, keywords, query);

    for(let projectIndex in data[0].searchResults)
    {
      let project = data[0].searchResults[projectIndex];
      project = projectDAO.projectHateoas(project, roles);
    }
  }

  return data;
} 

// Exports

// OPTIONS
exports.projectOptions = function (args, res)
{
  res.status(200).send();
};

exports.projectOptionsProtected = function (args, res)
{
  res.status(200).send();
};

// HEAD
exports.projectHead = async function (args, res) 
{
  defaultLog.debug('>>> {HEAD}/Public/Projects');

  try
  {
    let data = await getProjectHandler(constants.PUBLIC_ROLES, args.swagger.params);

    return data ? Actions.sendResponseV2(res, 200, data) 
      : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project information was not found'});
  }
  catch (e)
  {
    defaultLog.error('### Error in {HEAD}/Public/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {HEAD}/Public/Projects');
  }
};

exports.projectHeadProtected = async function (args, res) 
{
  defaultLog.debug('>>> {HEAD}/Projects');

  try
  {
    let data = await getProjectHandler(constants.SECURE_ROLES, args.swagger.params);

    return data ? Actions.sendResponseV2(res, 200, data) 
      : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project information was not found'});
  }
  catch (e)
  {
    defaultLog.error('### Error in {HEAD}/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {HEAD}/Projects');
  }
};

// GET (Public/Protected)
exports.fetchProjects = async function (args, res) 
{
  defaultLog.debug('>>> {GET}/Public/Projects');

  try
  {
    let data = await getProjectHandler(constants.PUBLIC_ROLES, args.swagger.params);

    return data ? Actions.sendResponseV2(res, 200, data)
      : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project information was not found'});
  }
  catch (e)
  {
    defaultLog.error('### Error in {GET}/Public/Projects/ :', e);
    return res.json({ code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {GET}/Public/Projects');
  }
};

exports.fetchProjectsProtected = async function (args, res) 
{
  defaultLog.debug('>>> {GET}/Projects');

  try
  {
    let data = await getProjectHandler(constants.SECURE_ROLES, args.swagger.params);

    return data ? Actions.sendResponseV2(res, 200, data) 
      : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project information was not found'});
  }
  catch (e)
  {
    defaultLog.error('### Error in {GET}/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {GET}/Projects');
  }
};

// POST (Protected Only, createProject)
exports.createProject = async function (args, res) 
{
  defaultLog.debug('>>> {POST}/Projects');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'project'))
    {
      defaultLog.debug('Creating new project');
            
      let project = args.swagger.params.project.value;

      project = await projectDAO.createProject(args.swagger.params.auth_payload.preferred_username, project);
            
      if(project)
      {
        // If the resource was successfully created, fetch it and return it
        project = await projectDAO.getProject(constants.SECURE_ROLES, project._id);
                
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 201, project);
      }
      else
      {
        throw Error('Project could not be created');
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {POST}/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {POST}/Projects');
  }
};

// PUT (Protected Only updateProject)
exports.updateProject = async function (args, res) 
{
  defaultLog.debug('>>> {PUT}/Projects');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId') && Object.prototype.hasOwnProperty.call(args.swagger.params, 'project'))
    {
      let projectId = args.swagger.params.projId.value;
            
      defaultLog.debug(' Updating project ' + projectId);
            
      let sourceProject = await projectDAO.getProject(constants.SECURE_ROLES, projectId);
      let updatedProject = args.swagger.params.project.value;

      if(sourceProject && updatedProject)
      {
        updatedProject = await projectDAO.updateProject(args.swagger.params.auth_payload.preferred_username, sourceProject, updatedProject);

        updatedProject = projectDAO.projectHateoas(updatedProject, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, updatedProject);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {PUT}/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {PUT}/Projects');
  }
};

// DELETE (Protected Only, deleteProject)
exports.deleteProject = async function (args, res) 
{
  defaultLog.debug('>>> {DELETE}/Projects');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId'))
    {
      let projectId = args.swagger.params.projId.value;
            
      defaultLog.debug(' Deleting project ' + projectId);
            
      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.deleteProject(args.swagger.params.auth_payload.preferred_username, project);

        // delete endpoints return the original resource so
        // 1.) we honour the principle of idempotency and safety
        // 2.) we can recreate the resource in the event this was done in error
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {DELETE}/Projects/ :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
  }
  finally
  {
    defaultLog.debug('<<< {DELETE}/Projects');
  }
};

// PUT (Protected Only, publishProject)
exports.publishProject = async function (args, res) 
{
  defaultLog.debug('>>> {PUT}/Projects{id}/Publish');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId'))
    {
      let projectId = args.swagger.params.projId.value;
            
      defaultLog.debug(' Publishing project ' + projectId);
            
      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.publishProject(args.swagger.params.auth_payload.preferred_username, project);
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {PUT}/Projects{id}/Publish :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Publish' });        
  }
  finally
  {
    defaultLog.debug('<<< {PUT}/Projects{id}/Publish');
  }
};

// PUT (Protected Only, unPublishProject)
exports.unPublishProject = async function (args, res) 
{
  defaultLog.debug('>>> {PUT}/Projects{id}/Unpublish');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId'))
    {
      let projectId = args.swagger.params.projId.value;
            
      defaultLog.debug(' Un-Publishing project ' + projectId);
            
      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.unPublishProject(args.swagger.params.auth_payload.preferred_username, project);
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {PUT}/Projects{id}/Unpublish :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Unpublish' });        
  }
  finally
  {
    defaultLog.debug('<<< {PUT}/Projects{id}/Unpublish');
  }
};

// Extensions should be a model, and include endpoints for fetching
// these could also be broken out of project controller and put into an extension controller

// POST (Protected Only, createExtension)
exports.createProjectExtension = async function (args, res)
{
  defaultLog.debug('>>> {POST}/Projects/{id}/Extensions');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId') && Object.prototype.hasOwnProperty.call(args.swagger.params, 'extension'))
    {
      let projectId = args.swagger.params.projId.value;
      let extension = args.swagger.params.extension.value;

      defaultLog.debug(' Adding extension to project ' + projectId);
      defaultLog.debug(' Extension: ' + JSON.stringify(extension));

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.addExtension(args.swagger.params.auth_payload.preferred_username, extension, project);
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 201, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {POST}/Projects/{id}/Extensions :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });        
  }
  finally
  {
    defaultLog.debug('<<< {POST}/Projects/{id}/Extensions');
  }
};

// PUT (Protected Only, updateExtension)
exports.updateProjectExtension = async function (args, res)
{
  defaultLog.debug('>>> {PUT}/Projects/{id}/Extensions');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId') && Object.prototype.hasOwnProperty.call(args.swagger.params, 'extension'))
    {
      let projectId = args.swagger.params.projId.value;
      let extension = args.swagger.params.extension.value;

      defaultLog.debug(' Updating extension on project ' + projectId);
      defaultLog.debug(' Extension: ' + JSON.stringify(extension));

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.updateExtension(args.swagger.params.auth_payload.preferred_username, extension, project);
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {PUT}/Projects/{id}/Extensions :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });        
  }
  finally
  {
    defaultLog.debug('<<< {PUT}/Projects/{id}/Extensions');
  }
};

// DELETE (Protected Only, deleteExtension)
exports.deleteProjectExtension = async function (args, res)
{
  defaultLog.debug('>>> {DELETE}/Projects/{id}/Extensions');

  try
  {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId') && Object.prototype.hasOwnProperty.call(args.swagger.params, 'extension'))
    {
      let projectId = args.swagger.params.projId.value;
      let extension = JSON.parse(args.swagger.params.item.value);

      defaultLog.debug(' Updating extension on project ' + projectId);
      defaultLog.debug(' Extension: ' + JSON.stringify(extension));

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project)
      {
        project = await projectDAO.updateExtension(args.swagger.params.auth_payload.preferred_username, extension, project);
        project = projectDAO.projectHateoas(project, constants.SECURE_ROLES);
        return Actions.sendResponseV2(res, 200, project);
      }
      else
      {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    }
    else
    {
      throw Error('Invalid request');
    }
  }
  catch (e)
  {
    defaultLog.error('### Error in {DELETE}/Projects/{id}/Extensions :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });
  }
  finally
  {
    defaultLog.debug('<<< {DELETE}/Projects/{id}/Extensions');
  }
};

exports.fetchFeaturedDocuments = async function (args, res) 
{
  defaultLog.debug('>>> {GET}/Public/Projects/{id}/FeaturedDocuments');

  try
  {
    if (args.swagger.params.projId && args.swagger.params.projId.value) 
    {

      let project = await projectDAO.getProject(constants.PUBLIC_ROLES, args.swagger.params.projId);
      let featuredDocs = await getFeaturedDocuments(project, true);

      return Actions.sendResponseV2(res, 200, featuredDocs);
    } 
    else 
    {
      return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project not found'});
    }
  }
  catch(e)
  {
    defaultLog.error('### Error in {GET}/Public/Projects/{id}/FeaturedDocuments :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects{id}/FeaturedDocuments' });
  }
  finally
  {
    defaultLog.debug('<<< {GET}/Public/Projects/{id}/FeaturedDocuments');
  }
};
  
exports.fetchFeaturedDocumentsSecure = async function (args, res) 
{
  defaultLog.debug('>>> {GET}/Projects/{id}/FeaturedDocuments');

  try
  {
    if (args.swagger.params.projId && args.swagger.params.projId.value) 
    {
      let project = await projectDAO.getProject(args.swagger.params.projId.value);
            
      let featuredDocs = await getFeaturedDocuments(project, false);
        
      return Actions.sendResponseV2(res, 200, featuredDocs);
    } 
    
    return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project not found'});
  }
  catch(e)
  {
    defaultLog.error('### Error in {GET}/Projects/{id}/FeaturedDocuments :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/FeaturedDocuments' });
  }
  finally
  {
    defaultLog.debug('<<< {GET}/Projects/{id}/FeaturedDocuments');
  }
};
  
var getFeaturedDocuments = async function(project) 
{
  try 
  {
    let documents = await mongoose.model('Document').find({ project: project._id, isFeatured: true });
        
    if(documents)
    {
      return documents;
    }
    else
    {
      throw Error('Featured documents could not be loaded.');
    }
  } 
  catch(e) 
  {
    throw Error(e);
  }
}