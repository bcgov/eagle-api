const _          = require('lodash');
const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const Utils      = require('../helpers/utils');
const projectDAO = require('../dao/projectDAO');
const constants  = require('../helpers/constants');

exports.getProjectPins = async function(user, roles, project, pageNumber, pageSize, sortBy) {
  let skip = null,
    limit = null,
    sort = null;

  let query = {};

  _.assignIn(query, { "_schemaName": "Project" });

  let fields = ['_id', 'pins', 'name', 'website', 'province', 'pinsRead'];

  // Getting a single project
  _.assignIn(query, { _id: mongoose.Types.ObjectId(project._id) });

  var data = await Utils.runDataQuery('Project',
    roles,
    query,
    fields, // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    false, // count
    null,
    true,
    null);

  _.assignIn(query, { "_schemaName": "Organization" });

  let thePins = [];

  if (data.length === 0) {
    // no pins, return empty result;
    return [{ total_items: 0 }];
  } else {
    if (data[0].pinsRead && !data[0].pinsRead.includes("public") && user === "public") {
      // This is the case that the public api has asked for these pins but they are not published yet
      return [{ total_items: 0 }];
    }

    thePins = data[0].pins.map(pin => mongoose.Types.ObjectId(pin));

    query = { _id: { $in: thePins } };
    const read = data[0].pinsRead;

    // Sort
    if (sortBy && sortBy.value) {
      sort = {};
      sortBy.value.forEach(function (value) {
        var order_by = value.charAt(0) == '-' ? -1 : 1;
        var sort_by = value.slice(1);

        sort[sort_by] = order_by;
      }, this);
    }

    // Skip and limit
    let processedParameters = Utils.getSkipLimitParameters(pageSize, pageNumber);
    skip = processedParameters.skip;
    limit = processedParameters.limit;

    try {
      let orgData = await Utils.runDataQuery('Organization',
        roles,
        query,
        fields, // Fields
        null,
        sort, // sort
        skip, // skip
        limit, // limit
        false); // count

      //Add out pinsread field to our response
      if (orgData && orgData.length > 0) {
        orgData[0].read = (read) ? read.slice() : [];
      }

      Utils.recordAction('Get', 'Pin', user, project._id);

      return orgData;
    } catch (e) {
      throw Error('Failed to fetch project pins: ', e);
    }
  }
};

exports.createPin = async function(user, project, pins) {
  let projectModel = mongoose.model('Project');
  let pinsArr = [];

  pins.value.map(item => {
    pinsArr.push(mongoose.Types.ObjectId(item));
  });

  // Add pins to pins existing
  var doc = await projectModel.update(
    {
      _id: mongoose.Types.ObjectId(project._id)
    },
    {
      $push: {pins: { $each: pinsArr }}
    },
    {
      new: true
    });

  if (doc) {
    Utils.recordAction('Add', 'Pin', user, project._id);
    return projectDAO.projectHateoas(doc, constants.SECURE_ROLES);
  } else {
    throw Error('Project ' + project._id + ' not found');
  }
};

exports.publishPins = async function(user, project) {
  let projectModel = require('mongoose').model('Project');

  try {
    if (project && project.pins) {
      let published = await projectModel.update(
        { _id: mongoose.Types.ObjectId(project._id) },
        {
          $addToSet: { "pinsRead": 'public' }
        });

      Utils.recordAction('Publish', 'PIN', user);
      return projectDAO.projectHateoas(published, ['sysadmin', 'staff']);
    } else {
      throw Error('Invalid or non-existant project. Please submit a valid project to publish project pins');
    }
  } catch (e) {
    throw Error('Could not publish pins for project: ', e);
  }
};

exports.unPublishPins = async function(user, project) {
  let projectModel = require('mongoose').model('Project');

  try {
    if (project && project.pins) {
      defaultLog.info("Project:", project._id);

      var published = await projectModel.update(
        { _id: mongoose.Types.ObjectId(project._id) },
        { $pull: { "pinsRead": 'public' }});

      Utils.recordAction('UnPublish', 'PIN', user, project._id);

      return projectDAO.projectHateoas(published, ['sysadmin', 'staff']);
    } else {
      throw Error('Invalid or non-existant project. Please submit a valid project to un-publish project pins');
    }
  } catch (e) {
    console.log(e);
    throw Error('Could not un-publish pins for project: ', e);
  }
};

exports.deletePin = async function(user, pinId, project) {
  let projectModel = require('mongoose').model('Project');

  try {
    let updatedProject = await projectModel.update(
      { _id: project._id },
      { $pull: { pins: { $in: [mongoose.Types.ObjectId(pinId)] } } },
      { new: true }
    );

    Utils.recordAction('Delete', 'Pin', user, pinId);

    return projectDAO.projectHateoas(updatedProject, ['sysadmin', 'staff']);
  } catch (e) {
    throw Error('Could not delete pin', e);
  }
};