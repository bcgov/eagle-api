// Imports
const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');
const pinDAO     = require('../dao/pinDAO');

// Constants
const PUBLIC_ROLES = ['public'];
const SECURE_ROLES = ['sysadmin', 'staff'];
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

// GET (Public, getPin)
exports.publicPinGet = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Public/Projects/{id}/Pins');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
                
            defaultLog.debug(' Fetching pins for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let pageNumber = params.pageNumber.value ? params.pageNumber.value : 1;
                let pageSize   = params.pageSize.value   ? params.pageSize.value   : 10;
                let sortBy     = params.sortBy.value     ? params.sortBy.value     : '';
    
                let data = await pinDAO.getProjectPins(PUBLIC_ROLES, project, pageNumber, pageSize, sortBy);
    
                return data ? Actions.sendResponse(res, 200, data) 
                            : Actions.sendResponse(res, 404, { code: 404, message: 'Project pins were not found'});
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
        defaultLog.error('### Error in {GET}/Public/Projects/{id}/Pins :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects/{id}/Pins' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Public/Projects/{id}/Pins');
    }
};

// GET (Protected Only, getPin)
exports.protectedPinGet = async function (args, res, next)
{
    defaultLog.debug('>>> {GET}/Projects/{id}/Pins');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
                
            defaultLog.debug(' Fetching pins for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let pageNumber = params.pageNumber.value ? params.pageNumber.value : 1;
                let pageSize   = params.pageSize.value   ? params.pageSize.value   : 10;
                let sortBy     = params.sortBy.value     ? params.sortBy.value     : '';
    
                let data = await pinDAO.getProjectPins(SECURE_ROLES, project, pageNumber, pageSize, sortBy);
    
                return data ? Actions.sendResponse(res, 200, data) 
                            : Actions.sendResponse(res, 404, { code: 404, message: 'Project pins were not found'});
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
        defaultLog.error('### Error in {GET}/Projects/{id}/Pins :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET}/Projects/{id}/Pins');
    }
};

// GET (Protected Only, createPin)
exports.protectedPinCreate = async function (args, res, next)
{
    defaultLog.debug('>>> {POST}/Projects/{id}/Pins');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
                
            defaultLog.debug(' Creating pin for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let pins = args.swagger.params.pins;

                if(pins)
                {
                    let data = await pinDAO.createPin(args.swagger.params.auth_payload.preferred_username, project, pins);
        
                    return data ? Actions.sendResponse(res, 200, data) 
                                : Actions.sendResponse(res, 404, { code: 404, message: 'Project pins were not found'});
                }
                else
                {
                    throw Error('Invalid request');
                }
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
        defaultLog.error('### Error in {POST}/Projects/{id}/Pins :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST}/Projects/{id}/Pins');
    }
};

// PUT (Protected Only, publishPin)
exports.protectedPublishPin = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Projects/{id}/Pins/Publish');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
                
            defaultLog.debug(' Publishing pins for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let publishedProject = await pinDAO.publishPins(args.swagger.params.auth_payload.preferred_username, project);
        
                return publishedProject ? Actions.sendResponse(res, 200, publishedProject) 
                                        : Actions.sendResponse(res, 404, { code: 404, message: 'Project pins were not found or could not be published'});
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
        defaultLog.error('### Error in {PUT}/Projects/{id}/Pins/Publish :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins/Publish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects/{id}/Pins/Publish');
    }
};

// PUT (Protected Only, unPublishPin)
exports.protectedUnPublishPin = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT}/Projects/{id}/Pins/Unpublish');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId'))
        {
            let projectId = args.swagger.params.projId.value;
                
            defaultLog.debug(' Un-Publishing pins for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let publishedProject = await pinDAO.unPublishPins(args.swagger.params.auth_payload.preferred_username, project);
        
                return publishedProject ? Actions.sendResponse(res, 200, publishedProject) 
                                        : Actions.sendResponse(res, 404, { code: 404, message: 'Project pins were not found or could not be published'});
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
        defaultLog.error('### Error in {PUT}/Projects/{id}/Pins/Unpublish :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins/Unpublish' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT}/Projects/{id}/Pins/Unpublish');
    }
};

// DELETE (Protected Only, deletePin)
exports.protectedPinDelete = async function (args, res, next)
{
    defaultLog.debug('>>> {DELETE}/Projects/{projId}/Pins/{pinId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('pinId'))
        {
            let projectId = args.swagger.params.projId.value;
            let pinId = args.swagger.params.pinId.value;

            defaultLog.debug(' Deleting pin ' + pinId + ' for project: ' + projectId);
            
            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                project = pinDAO.deletePin(args.swagger.params.auth_payload.preferred_username, pinId, project);

                return publishedProject ? Actions.sendResponse(res, 200, project) 
                                        : Actions.sendResponse(res, 404, { code: 404, message: 'Project pin was not found or could not be deleted'});
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
        defaultLog.error('### Error in {DELETE}/Projects/{projId}/Pins/{pinId} :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{projId}/Pins/{pinId}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE}/Projects/{projId}/Pins/{pinId}');
    }
};