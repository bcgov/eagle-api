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
/* put any needd local function here */

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

// ? no getGroups (list)
// ? no getGroup (resource)
// ? no getMemeber (resource)

// POST (Protected only createGroup)
exports.protectedAddGroup = function (args, res, rest) 
{
    defaultLog.debug('>>> {POST} /Projects/{id}/Groups');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('group'))
        {
            let projectId = args.swagger.params.projId.value;
            let group = JSON.parse(args.swagger.params.group.value);

            defaultLog.debug(' Creating group for project ' + projectId);
            defaultLog.debug(' group: ' + JSON.stringify(group));

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);

            if(project)
            {
                let savedGroup = await projectGroupDAO.createGroup(args.swagger.params.auth_payload.preferred_username, group, project);

                return Actions.sendResponse(res, 201, savedGroup);
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
        defaultLog.error('### Error in {POST} /Projects/{id}/Groups :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST} /Projects/{id}/Groups');
    }
};

// DELETE (Protected only deleteGroup)
exports.protectedGroupDelete = function (args, res, rest) 
{
    defaultLog.debug('>>> {DELETE} /Projects/{projId}/Groups/{groupId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;

            defaultLog.debug(' Deleting group ' + groupId + ' from project ' + projectId);

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);
            let group = await projectGroupDAO.getGroup(groupId);

            if(project && group)
            {
                group = await projectGroupDAO.deleteGroup(args.swagger.params.auth_payload.preferred_username, group, project);

                return Actions.sendResponse(res, 200, group);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
            }
        }
        else
        {
            throw Error('Invalid request');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {DELETE} /Projects/{projId}/Groups/{groupId} :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE} /Projects/{projId}/Groups/{groupId}');
    }
};

// PUT (Protected only updateGroup)
exports.protectedGroupPut = function (args, res, rest) 
{
    defaultLog.debug('>>> {PUT} /Projects/{projId}/Groups/{groupId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let updatedGroup = args.swagger.params.groupObject.value;

            defaultLog.debug(' Updating group ' + groupId + ' from project ' + projectId);

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);
            let sourceGroup = await projectGroupDAO.getGroup(groupId);

            if(project && updatedGroup && sourceGroup)
            {
                updatedGroup = await projectGroupDAO.updateGroup(args.swagger.params.auth_payload.preferred_username, updatedGroup, sourceGroup);

                return Actions.sendResponse(res, 200, updatedGroup);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
            }
        }
        else
        {
            throw Error('Invalid request');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {PUT} /Projects/{projId}/Groups/{groupId} :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT} /Projects/{projId}/Groups/{groupId}');
    }
};

// POST (Protected only createGroupMember)
exports.protectedAddGroupMembers = function (args, res, rest) 
{
    defaultLog.debug('>>> {POST} /Projects/{projId}/Groups/{groupId}/members');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let members = args.swagger.params.members.value;

            defaultLog.debug(' Creating group ' + groupId + ' members');
            defaultLog.debug(' Members: ' + JSON.stringify(members));

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);
            let group = await projectGroupDAO.getGroup(groupId);

            if(project && group && members)
            {
                updatedGroup = await projectGroupDAO.addGroupMember(args.swagger.params.auth_payload.preferred_username, group, members);

                return Actions.sendResponse(res, 201, updatedGroup);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
            }
        }
        else
        {
            throw Error('Invalid request');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {POST} /Projects/{projId}/Groups/{groupId}/members :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST} /Projects/{projId}/Groups/{groupId}/members');
    }
};

// GET (Protected only getGroupMembers)
exports.protectedGroupGetMembers = function (args, res, rest) 
{
    defaultLog.debug('>>> {GET} /Projects/{projId}/Groups/{groupId}/members');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;

            defaultLog.debug(' Fetching group ' + groupId + ' members from project ' + projectId);

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);
            let group = await projectGroupDAO.getGroup(groupId);

            if(project && group)
            {
                let pageNumber = params.pageNumber.value ? params.pageNumber.value : 1;
                let pageSize   = params.pageSize.value   ? params.pageSize.value   : 10;
                let sortBy     = params.sortBy.value     ? params.sortBy.value     : '';

                let members = await projectGroupDAO.getGroupMembers(SECURE_ROLES, args.swagger.params.auth_payload.preferred_username, group, sortBy, pageSize, pageNumber);

                return Actions.sendResponse(res, 200, members);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
            }
        }
        else
        {
            throw Error('Invalid request');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {GET} /Projects/{projId}/Groups/{groupId}/members :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET} /Projects/{projId}/Groups/{groupId}/members');
    }
};

// DELETE (Protected only deleteGroupMember)
exports.protectedDeleteGroupMembers = function (args, res, rest) 
{
    defaultLog.debug('>>> {DELETE} /Projects/{projId}/Groups/{groupId}/members/{memberId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('memberId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let memberId = args.swagger.params.memberId.value;

            defaultLog.debug(' Deleting member ' + memberId + ' from group ' + groupId + ' from project ' + projectId);

            let project = await projectDAO.getProject(SECURE_ROLES, projectId);
            let group = await projectGroupDAO.getGroup(groupId);
            let member = await projectGroupDAO.getGroupMember(memberId); // this will duplicate getUser?

            if(project && group && member)
            {
                let updatedGroup = await projectGroupDAO.deleteGroupMember(args.swagger.params.auth_payload.preferred_username, group, member);

                return Actions.sendResponse(res, 200, updatedGroup);
            }
            else
            {
                return Actions.sendResponse(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
            }
        }
        else
        {
            throw Error('Invalid request');
        }
    }
    catch (e)
    {
        defaultLog.error('### Error in {DELETE} /Projects/{projId}/Groups/{groupId}/members :', e);
        return Actions.sendResponse(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE} /Projects/{projId}/Groups/{groupId}/members/{memberId}');
    }
};
