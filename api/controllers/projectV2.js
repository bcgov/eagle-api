// Imports
const _          = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const qs         = require('qs');
const Actions    = require('../helpers/actions');
const Utils      = require('../helpers/utils');
const projectDAO = require('../dao/projectDAO');

// Constants
/* put any needed constants here */ 
// Vars
/* put any needed local variables here */
// functions
/* put any needed local functions here */

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
        let data = {};

        // fetch a project, or a list of projects
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Fetching project ' + projectId);
            data = await projectDAO.getProject(projectId);
        }
        else
        {
            let pageNumber = args.swagger.params.pageNumber ? args.swagger.params.pageNumber : 1;
            let pageSize   = args.swagger.params.pageSize   ? args.swagger.params.pageSize   : 10;
            let sortBy     = args.swagger.params.sortBy     ? args.swagger.params.sortBy     : '';
            let query      = args.swagger.params.query      ? args.swagger.params.query      : '';

            data = await projectDAO.getProjects(pageNumber, pageSize, sortBy, query);
        }

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
        let data = {};

        // fetch a project, or a list of projects
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Fetching project ' + projectId);
            data = await projectDAO.getProject(projectId);
        }
        else
        {
            let pageNumber = args.swagger.params.pageNumber ? args.swagger.params.pageNumber : 1;
            let pageSize   = args.swagger.params.pageSize   ? args.swagger.params.pageSize   : 10;
            let sortBy     = args.swagger.params.sortBy     ? args.swagger.params.sortBy     : '';
            let query      = args.swagger.params.query      ? args.swagger.params.query      : '';

            data = await projectDAO.getProjects(pageNumber, pageSize, sortBy, query);
        }

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
        let data = {};

        // fetch a project, or a list of projects
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Fetching project ' + projectId);
            data = await projectDAO.getProject(projectId);
        }
        else
        {
            let pageNumber = args.swagger.params.pageNumber ? args.swagger.params.pageNumber : 1;
            let pageSize   = args.swagger.params.pageSize   ? args.swagger.params.pageSize   : 10;
            let sortBy     = args.swagger.params.sortBy     ? args.swagger.params.sortBy     : '';
            let query      = args.swagger.params.query      ? args.swagger.params.query      : '';

            data = await projectDAO.getProjects(pageNumber, pageSize, sortBy, query);
        }

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
        let data = {};

        // fetch a project, or a list of projects
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
            
            defaultLog.debug(' Fetching project ' + projectId);
            data = await projectDAO.getProject(projectId);
        }
        else
        {
            let pageNumber = args.swagger.params.pageNumber ? args.swagger.params.pageNumber : 1;
            let pageSize   = args.swagger.params.pageSize   ? args.swagger.params.pageSize   : 10;
            let sortBy     = args.swagger.params.sortBy     ? args.swagger.params.sortBy     : '';
            let query      = args.swagger.params.query      ? args.swagger.params.query      : '';

            data = await projectDAO.getProjects(pageNumber, pageSize, sortBy, query);
        }

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

            project = await projectDAO.createProject(project);

            return Actions.sendResponse(res, 200, project);
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
            
            let sourceProject = await projectDAO.getProject(projectId);
            let updatedProject = args.swagger.params.project.value;

            if(sourceProject && updateProject)
            {
                updatedProject = await projectDAO.updateProject(sourceProject, updatedProject);

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
            
            let project = await projectDAO.getProject(projectId);

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