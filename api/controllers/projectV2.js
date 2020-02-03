// Imports
const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');

// Constants
const PUBLIC_ROLES = ['public'];
const SECURE_ROLES = ['sysadmin', 'staff'];
// Vars
/* put any needed local variables here */
// functions
async function getProjectHandler(roles, params)
{
    let data = {};

    // fetch a project, or a list of projects
    if (params.hasOwnProperty('projId'))
    {
        let projectId = params.projId.value;
        
        defaultLog.debug(' Fetching project ' + projectId);
        data = await projectDAO.getProject(PUBLIC_ROLES, projectId);
    }
    else
    {
        let pageNumber = params.hasOwnProperty('pageNumber') && params.pageNumber.value ? params.pageNumber.value : 1;
        let pageSize   = params.hasOwnProperty('pageSize')   && params.pageSize.value   ? params.pageSize.value   : 10;
        let sortBy     = params.hasOwnProperty('sortBy')     && params.sortBy.value     ? params.sortBy.value     : '';
        let query      = params.hasOwnProperty('query')      && params.query.value      ? params.query.value      : '';
        let keywords   = params.hasOwnProperty('keywords')   && params.keywords.value   ? params.keywords.value   : '';

        data = await projectDAO.getProjects(PUBLIC_ROLES, pageNumber, pageSize, sortBy, keywords, query);
    }

    return data;
} 

// Exports

// OPTIONS
exports.publicOptions = function (args, res, rest) 
{
  res.status(200).send();
};

exports.protectedOptions = function (args, res, rest) 
{
  res.status(200).send();
};

// HEAD
exports.publicHead = async function (args, res, next) 
{
    defaultLog.debug('>>> {HEAD}/Public/Projects');

    try
    {
        let data = await getProjectHandler(PUBLIC_ROLES, args.swagger.params);

        return data ? Actions.sendResponse(res, 200, data) 
                    : Actions.sendResponse(res, 404, { code: 404, message: 'Project information was not found'});
    }
    catch (e)
    {
        defaultLog.error('### Error in {HEAD}/Public/Projects/ :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {HEAD}/Public/Projects');
    }
};

exports.protectedHead = async function (args, res, next) 
{
    defaultLog.debug('>>> {HEAD}/Projects');

    try
    {
        let data = await getProjectHandler(SECURE_ROLES, args.swagger.params);

        return data ? Actions.sendResponse(res, 200, data) 
                    : Actions.sendResponse(res, 404, { code: 404, message: 'Project information was not found'});
    }
    catch (e)
    {
        defaultLog.error('### Error in {HEAD}/Projects/ :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {HEAD}/Projects');
    }
};

// GET (Public/Protected)
exports.publicGet = async function (args, res, next) 
{
    defaultLog.debug('>>> {GET}/Public/Projects');

    try
    {
        let data = await getProjectHandler(PUBLIC_ROLES, args.swagger.params);

        return data ? Actions.sendResponse(res, 200, data) 
                    : Actions.sendResponse(res, 404, { code: 404, message: 'Project information was not found'});
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Public/Projects/ :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Public/Projects');
    }
};

exports.protectedGet = async function (args, res, next) 
{
    defaultLog.debug('>>> {GET}/Projects');

    try
    {
        let data = await getProjectHandler(SECURE_ROLES, args.swagger.params);

        return data ? Actions.sendResponse(res, 200, data) 
                    : Actions.sendResponse(res, 404, { code: 404, message: 'Project information was not found'});
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET}/Projects/ :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Projects');
    }
};

// POST (Protected Only, createProject)
exports.protectedPost = async function (args, res, next) 
{
    defaultLog.debug('>>> {POST}/Projects');

    try
    {
        if (args.swagger.params.hasOwnProperty('project'))
        {
            defaultLog.debug('Creating new project');
            
            let project = args.swagger.params.project.value;

            project = await projectDAO.createProject(args.swagger.params.auth_payload.preferred_username, project);
            
            if(project)
            {
                // If the resource was successfully created, fetch it and return it
                project = await projectDAO.getProject(SECURE_ROLES, project._id);
                return Actions.sendResponse(res, 201, project);
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST}/Projects');
    }
};

// PUT (Protected Only updateProject)
exports.protectedPut = async function (args, res, next) 
{
    defaultLog.debug('>>> {PUT}/Projects');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('project'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Updating project ' + projectId);
            
            let sourceProject = await projectDAO.getProject(SECURE_ROLES, projectId);
            let updatedProject = args.swagger.params.project.value;

            if(sourceProject && updateProject)
            {
                updatedProject = await projectDAO.updateProject(args.swagger.params.auth_payload.preferred_username, sourceProject, updatedProject);

                return Actions.sendResponse(res, 200, updatedProject);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects');
    }
};

// DELETE (Protected Only, deleteProject)
exports.protectedDelete = async function (args, res, next) 
{
    defaultLog.debug('>>> {DELETE}/Projects');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Deleting project ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.deleteProject(args.swagger.params.auth_payload.preferred_username, project);

                // delete endpoints return the original resource so
                // 1.) we honour the principle of idempotency and safety
                // 2.) we can recreate the resource in the event this was done in error
                return Actions.sendResponse(res, 200, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE}/Projects');
    }
};

// PUT (Protected Only, publishProject)
exports.protectedPublish = async function (args, res, next) 
{
    defaultLog.debug('>>> {PUT}/Projects{id}/Publish');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Publishing project ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.publishProject(args.swagger.params.auth_payload.preferred_username, project);

                return Actions.sendResponse(res, 200, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Publish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects{id}/Publish');
    }
};

// PUT (Protected Only, unPublishProject)
exports.protectedUnPublish = async function (args, res, next) 
{
    defaultLog.debug('>>> {PUT}/Projects{id}/Unpublish');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Un-Publishing project ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.unPublishProject(args.swagger.params.auth_payload.preferred_username, project);

                return Actions.sendResponse(res, 200, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Unpublish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects{id}/Unpublish');
    }
};

// Extensions should be a model, and include endpoints for fetching
// these could also be broken out of project controller and put into an extension controller

// POST (Protected Only, createExtension)
exports.protectedExtensionAdd = async function (args, res, next)
{
    defaultLog.debug('>>> {POST}/Projects/{id}/Extensions');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('extension'))
        {
            let projectId = args.swagger.params.projId.value;
            let extension = args.swagger.params.extension.value;

            defaultLog.debug(' Adding extension to project ' + projectId);
            defaultLog.debug(' Extension: ' + JSON.stringify(extension));

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.addExtension(args.swagger.params.auth_payload.preferred_username, extension, project);

                return Actions.sendResponse(res, 201, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST}/Projects/{id}/Extensions');
    }
};

// PUT (Protected Only, updateExtension)
exports.protectedExtensionUpdate = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Projects/{id}/Extensions');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('extension'))
        {
            let projectId = args.swagger.params.projId.value;
            let extension = args.swagger.params.extension.value;

            defaultLog.debug(' Updating extension on project ' + projectId);
            defaultLog.debug(' Extension: ' + JSON.stringify(extension));

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.updateExtension(args.swagger.params.auth_payload.preferred_username, extension, project);

                return Actions.sendResponse(res, 200, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects/{id}/Extensions');
    }
};

// DELETE (Protected Only, deleteExtension)
exports.protectedExtensionDelete = async function (args, res, next)
{
    defaultLog.debug('>>> {DELETE}/Projects/{id}/Extensions');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('extension'))
        {
            let projectId = args.swagger.params.projId.value;
            let extension = JSON.parse(args.swagger.params.item.value);

            defaultLog.debug(' Updating extension on project ' + projectId);
            defaultLog.debug(' Extension: ' + JSON.stringify(extension));

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = await projectDAO.updateExtension(args.swagger.params.auth_payload.preferred_username, extension, project);

                return Actions.sendResponse(res, 200, project);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
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
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Extensions' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE}/Projects/{id}/Extensions');
    }
};