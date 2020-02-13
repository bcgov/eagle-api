// Imports
const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');
const projectGroupDAO = require('../dao/projectGroupDAO');

// OPTIONS
exports.projectGroupOptions = function (args, res, next)
{
  res.status(200).send();
};

exports.projectGroupOptionsProtected = function (args, res, next)
{
  res.status(200).send();
};

// ? no getGroups (list)
// ? no getGroup (resource)
// ? no getMemeber (resource)

// POST (Protected only createGroup)
exports.createGroup = async function (args, res, next)
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

            let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

            if(project)
            {
                let savedGroup = await projectGroupDAO.createGroup(args.swagger.params.auth_payload.preferred_username, group.name, project);
                savedGroup = projectGroupDAO.groupHateoas(savedGroup, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 201, savedGroup);
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
        defaultLog.error('### Error in {POST} /Projects/{id}/Groups :', e);
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST} /Projects/{id}/Groups');
    }
};

// DELETE (Protected only deleteGroup)
exports.deleteGroup = async function (args, res, next)
{
    defaultLog.debug('>>> {DELETE} /Projects/{projId}/Groups/{groupId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;

            defaultLog.debug(' Deleting group ' + groupId + ' from project ' + projectId);

            let resources = await Promise.all([projectDAO.getProject(constants.SECURE_ROLES, projectId),
                                               projectGroupDAO.getGroup(groupId)]);

            let project = resources[0];
            let group = resources[1];

            if(project && group)
            {
                group = await projectGroupDAO.deleteGroup(args.swagger.params.auth_payload.preferred_username, group, project);
                group = projectGroupDAO.groupHateoas(group, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 200, group);
            }
            else
            {
                return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
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
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE} /Projects/{projId}/Groups/{groupId}');
    }
};

// PUT (Protected only updateGroup)
exports.updateGroup = async function (args, res, next)
{
    defaultLog.debug('>>> {PUT} /Projects/{projId}/Groups/{groupId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId') && args.swagger.params.hasOwnProperty('updatedGroup'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let updatedGroup = args.swagger.params.groupObject.value;

            defaultLog.debug(' Updating group ' + groupId + ' from project ' + projectId);

            let resources = await Promise.all([projectDAO.getProject(constants.SECURE_ROLES, projectId),
                                               projectGroupDAO.getGroup(groupId)]);

            let project = resources[0];
            let sourceGroup = resources[1];

            if(project && updatedGroup && sourceGroup)
            {
                updatedGroup = await projectGroupDAO.updateGroup(args.swagger.params.auth_payload.preferred_username, updatedGroup, sourceGroup);
                updatedGroup = projectGroupDAO.groupHateoas(updatedGroup, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 200, updatedGroup);
            }
            else
            {
                return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
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
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {PUT} /Projects/{projId}/Groups/{groupId}');
    }
};

// POST (Protected only createGroupMember)
exports.createGroupMemeber = async function (args, res, next)
{
    defaultLog.debug('>>> {POST} /Projects/{projId}/Groups/{groupId}/members');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId') && args.swagger.params.hasOwnProperty('members'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let members = args.swagger.params.members.value;

            defaultLog.debug(' Creating group ' + groupId + ' members');
            defaultLog.debug(' Members: ' + JSON.stringify(members));

            let resources = await Promise.all([projectDAO.getProject(constants.SECURE_ROLES, projectId),
                                            projectGroupDAO.getGroup(groupId)]);

            let project = resources[0];
            let group = resources[1];

            if(project && group && members)
            {
                updatedGroup = await projectGroupDAO.addGroupMember(args.swagger.params.auth_payload.preferred_username, group, members);
                updatedGroup = projectGroupDAO.groupHateoas(updatedGroup, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 201, updatedGroup);
            }
            else
            {
                return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
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
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members' });        
    }
    finally
    {
        defaultLog.debug('<<< {POST} /Projects/{projId}/Groups/{groupId}/members');
    }
};

// GET (Protected only getGroupMembers)
exports.fetchGroupMemebers = async function (args, res, next)
{
    defaultLog.debug('>>> {GET} /Projects/{projId}/Groups/{groupId}/members');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;

            defaultLog.debug(' Fetching group ' + groupId + ' members from project ' + projectId);

            let resources = await Promise.all([projectDAO.getProject(constants.SECURE_ROLES, projectId),
                                               projectGroupDAO.getGroup(groupId)]);

            let project = resources[0];
            let group = resources[1];

            if(project && group)
            {
                let pageNumber = args.swagger.params.hasOwnProperty('pageNumber') && args.swagger.params.pageNumber.value ? args.swagger.params.pageNumber.value : 1;
                let pageSize   = args.swagger.params.hasOwnProperty('pageSize')   && args.swagger.params.pageSize.value   ? args.swagger.params.pageSize.value   : 10;
                let sortBy     = args.swagger.params.hasOwnProperty('sortBy')     && args.swagger.params.sortBy.value     ? args.swagger.params.sortBy.value     : '';

                let members = await projectGroupDAO.getGroupMembers(constants.SECURE_ROLES, args.swagger.params.auth_payload.preferred_username, group, sortBy, pageSize, pageNumber);
                members = projectGroupDAO.groupHateoas(members, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 200, members);
            }
            else
            {
                return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
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
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members' });        
    }
    finally
    {
        defaultLog.debug('<<< {GET} /Projects/{projId}/Groups/{groupId}/members');
    }
};

// DELETE (Protected only deleteGroupMember)
exports.deleteGroupMember = async function (args, res, next)
{
    defaultLog.debug('>>> {DELETE} /Projects/{projId}/Groups/{groupId}/members/{memberId}');

    try
    {
        if (args.swagger.params.hasOwnProperty('projId') && args.swagger.params.hasOwnProperty('groupId') && args.swagger.params.hasOwnProperty('memberId'))
        {
            let projectId = args.swagger.params.projId.value;
            let groupId = args.swagger.params.groupId.value;
            let memberId = args.swagger.params.memberId.value;

            defaultLog.debug(' Deleting member ' + memberId + ' from group ' + groupId + ' from project ' + projectId);

            let resources = await Promise.all([projectDAO.getProject(constants.SECURE_ROLES, projectId), 
                                               projectGroupDAO.getGroup(groupId), 
                                               projectGroupDAO.getGroupMember(memberId)]);

            let project = resources[0];
            let group = resources[1];
            let member = resources[2];

            if(project && group && member)
            {
                let updatedGroup = await projectGroupDAO.deleteGroupMember(args.swagger.params.auth_payload.preferred_username, group, member);
                data = projectGroupDAO.groupHateoas(data, constants.SECURE_ROLES);
                return Actions.sendResponseV2(res, 200, updatedGroup);
            }
            else
            {
                return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' or Group ' + groupId + ' not found.'});
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
        return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects{id}/Groups/{id}/members/{id}' });        
    }
    finally
    {
        defaultLog.debug('<<< {DELETE} /Projects/{projId}/Groups/{groupId}/members/{memberId}');
    }
};
