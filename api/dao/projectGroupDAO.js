const _          = require('lodash');
const mongoose   = require('mongoose');
const Utils      = require('../helpers/utils');

exports.groupHateoas = function(group, roles)
{
    group.links = [];

    if (roles && roles.length > 0 && (roles.includes('sysadmin') || roles.includes('staff')))
    {
        group.links.push({ rel: 'self', title: 'secure self', method: 'GET', href: '/api/v2/Projects/' + group.project + '/Groups/' + group._id });
        group.links.push({ rel: 'parent', title: 'secure parent project', method: 'GET', href: '/api/v2/Projects/' + group.project });
        group.links.push({ rel: 'update', title: 'Secure Project Update Group', method: 'PUT', href: '/api/v2//Projects/' + group.project + '/Groups/' + group._id });
        group.links.push({ rel: 'delete', title: 'Secure Project Delete Group', method: 'DELETE', href: '/api/v2/Projects/' + group.project + '/Groups/' + group._id });
        group.links.push({ rel: 'create', title: 'Secure Project Create Group Members', method: 'POST', href: '/api/v2/Projects/' + group.project + '/Groups/' + group._id + '/Members' });
        group.links.push({ rel: 'fetch', title: 'Secure Project Get Group Members', method: 'GET', href: '/api/v2/Projects/' + group.project + '/Groups/' + group._id + '/Members' });
    }

    return group;
};

exports.createGroup = async function(user, groupName, project)
{
    let groupModel = mongoose.model('Group');
    let newGroup = new groupModel({ project: mongoose.Types.ObjectId(project._id), name: groupName });

    ['project-system-admin', 'sysadmin', 'staff'].forEach(item => 
    {
        newGroup.read.push(item), 
        newGroup.write.push(item), 
        newGroup.delete.push(item)
    });

    newGroup._addedBy = user;
    
    return newGroup.save()
                   .then(function (savedGroup) 
                   {
                       Utils.recordAction('Add', 'Group', user, project._id);

                       return savedGroup;
                   });
};

exports.getGroup = async function(groupId)
{
    return await mongoose.model('Group').findById(mongoose.Types.ObjectId(groupId));
};

exports.deleteGroup = async function(user, group, project)
{
    let groupModel = mongoose.model('Group');

    try 
    {
        var foundGroup = await groupModel.findOneAndRemove({ _id: group._id });

        Utils.recordAction('Delete', 'Group', user, project._id);

        return foundGroup;
    } 
    catch (e) 
    {
        throw Error('Failed to delete group: ', e);
    }
};

exports.updateGroup = async function(user, updatedGroup, sourceGroup)
{
    let groupModel = require('mongoose').model('Group');

    try 
    {
      let group = await groupModel.findOneAndUpdate({ _id: sourceGroup._id }, updatedGroup, { upsert: false, new: true });

      Utils.recordAction('Put', 'Group', user, sourceGroup._id);
      
      return group;
    } 
    catch (e) 
    {
        throw Error('Failed to update group: ', e);
    }
};

exports.addGroupMember = async function(user, group, members)
{
    let groupModel = mongoose.model('Group');
    let membersArray = [];

    members.value.map(item => 
    {
        membersArray.push(mongoose.Types.ObjectId(item));
    });

    // Add members to members existing
    let updatedGroup = await groupModel.update(
    { 
        _id: mongoose.Types.ObjectId(group._id) },
        { $push: {  members: { $each: membersArray } } },
        { new: true }
    );

    if (updatedGroup) 
    {
        Utils.recordAction('Add', 'GroupMember', user, updatedGroup._id);

        return updatedGroup;
    } 
    else 
    {
        throw Error('Group member could not be added');
    }
};

exports.getGroupMembers = async function(roles, user, group, sortBy, pageSize, pageNumber)
{
    let skip = null, 
        limit = null, 
        sort = null;

    let query = {};
  
    _.assignIn(query, { "_schemaName": "Group" });
  
    let fields = ['_id', 'members', 'name', 'project'];

    // Getting a single group
    _.assignIn(query, { _id: mongoose.Types.ObjectId(group._id) });

    let resultData = await Utils.runDataQuery('Group',
                                               roles,
                                               query,
                                               fields, // Fields
                                               null, // sort warmup
                                               null, // sort
                                               null, // skip
                                               null, // limit
                                               false, // count
                                               null,
                                               false,
                                               null);

    if (resultData.length === 0) 
    {
        return [{ total_items: 0 }];
    } 
    else 
    {
        const theUsers = resultData[0].members.map(user => mongoose.Types.ObjectId(user));

        query = { _id: { $in: theUsers } };
        _.assignIn(query, { "_schemaName": "User" });

        // Sort
        if (sortBy && sortBy.value) 
        {
            sort = {};
            sortBy.value.forEach(function (value) 
            {
                let order_by = value.charAt(0) == '-' ? -1 : 1;
                let sort_by = value.slice(1);
                sort[sort_by] = order_by;
            }, this);
        }

        // Skip and limit
        let processedParameters = Utils.getSkipLimitParameters(pageSize, pageNumber);
        skip = processedParameters.skip;
        limit = processedParameters.limit;

        fields = ['_id', 'displayName', 'email', 'org', 'orgName', 'phoneNumber'];

        try 
        {
            var groupData = await Utils.runDataQuery('User',
                                                      roles,
                                                      query,
                                                      fields, // Fields
                                                      null,
                                                      sort, // sort
                                                      skip, // skip
                                                      limit, // limit
                                                      false); // count

            Utils.recordAction('Get', 'GroupMember', user);

            return groupData;
        } 
        catch (e) 
        {
            throw Error('Could not fetch members for group', e);
        }
    }
};

exports.getGroupMember = async function(memberId)
{
    return await mongoose.model('User').findById(mongoose.Types.ObjectId(memberId)); // hateoas from User DAO
};

exports.deleteGroupMember = async function(user, group, member)
{
    var groupModel = mongoose.model('Group');

    try 
    {
        var data = await groupModel.update(
            { _id: group._id },
            { $pull: { members: { $in: [mongoose.Types.ObjectId(member._id)] } } },
            { new: true }
        );

        Utils.recordAction('Delete', 'GroupMember', user, data._id);

        return data;
    } 
    catch (e) 
    {
        throw Error('Failed to delete group member');
    }
};