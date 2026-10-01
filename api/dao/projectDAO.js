const defaultLog = require('winston').loggers.get('default');
const mongoose   = require('mongoose');
const Actions    = require('../helpers/actions');
const Utils      = require('../helpers/utils');
const { legislationKey } = require('../helpers/constants');

exports.projectHateoas = function(project, roles) {
  project.links =
    [
      { rel: 'self', title: 'public self', type: 'GET', href: '/api/public/project/' + project._id },
      { rel: 'fetch', title: 'Public Project Pins List', type: 'GET', href: '/api/public/project/' + project._id + '/pin' }
    ];

  if (roles && roles.length > 0 && (roles.includes('sysadmin') || roles.includes('staff'))) {
    project.links.push({ rel: 'self', title: 'secure self', method: 'GET', href: '/api/project/' + project._id });
    project.links.push({ rel: 'update', title: 'Secure Project Update', method: 'PUT', href: '/api/project/' + project._id });
    project.links.push({ rel: 'delete', title: 'Secure Project Delete', method: 'DELETE', href: '/api/project/' + project._id });
    project.links.push({ rel: 'update', title: 'Secure Project Publish', method: 'PUT', href: '/api/project/' + project._id + '/publish' });
    project.links.push({ rel: 'update', title: 'Secure Project Un-Publish', method: 'PUT', href: '/api/project/' + project._id + '/unpublish' });
    project.links.push({ rel: 'fetch', title: 'Secure Project Pins List', method: 'GET', href: '/api/project/' + project._id + '/pin' });
    project.links.push({ rel: 'create', title: 'Secure Project Pins Create', method: 'POST', href: '/api/project/' + project._id + '/pin' });
    project.links.push({ rel: 'update', title: 'Secure Project Pins Publish', method: 'PUT', href: '/api/project/' + project._id + '/pin/publish' });
    project.links.push({ rel: 'update', title: 'Secure Project Pins Unpublish', method: 'PUT', href: '/api/project/' + project._id + '/pin/unpublish' });
    project.links.push({ rel: 'create', title: 'Secure Project Create Extensions', method: 'POST', href: '/api/project/' + project._id + '/extension' });
    project.links.push({ rel: 'update', title: 'Secure Project Update Extensions', method: 'PUT', href: '/api/project/' + project._id + '/extension' });
    project.links.push({ rel: 'delete', title: 'Secure Project Delete Extensions', method: 'DELETE', href: '/api/project/' + project._id + '/extension' });
    project.links.push({ rel: 'create', title: 'Secure Project Create Groups', method: 'POST', href: '/api/project/' + project._id + '/group' });
  }

  return project;
};

exports.getProject = async function(roles, projectId) {
  let result = await mongoose.model('Project').findById(new mongoose.Types.ObjectId(projectId));

  // sanitize based on roles. Return the first result
  // as we will only ever have one.
  result = Utils.filterData('Project', [result], roles)[0];

  return result;
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
  const key = project && project.legislationYear ? legislationKey(project.legislationYear) : null;
  if (key) {
    project.currentLegislationYear = key;
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
      Utils.recordAction('Unpublish', 'Project', user, project._id);

      return unpublished;
    })
    .catch(function (err) {
      throw Error('Failed to unpublish project', err);
    });
};

exports.addExtension = async function(user, extension, project) {
  let extensionType = extension.type === 'Extension' ? 'reviewExtensions' : 'reviewSuspensions';

  try {
    let data = await mongoose.model('Project').updateOne(
      { _id: project._id },
      { $push: { [extensionType]: extension } }
    );

    if (data.modifiedCount === 0) {
      throw Error('Project extensions could not be modified');
    }

    Utils.recordAction('Post', 'Extension', user, project._id);

    return data;
  } catch (e) {
    defaultLog.error('Project extension could not be added: %s', e.message);
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
    let dataRemoved = await projectModel.updateOne(
      { _id: project._id },
      { $pull: { [extensionOldType]: extensionOld } }
    );

    if (dataRemoved.modifiedCount === 0) {
      throw Error('Project extensions could not be modified');
    }

    let dataAdded = await projectModel.updateOne(
      { _id: project._id },
      { $push: { [extensionNewType]: extensionNew } }
    );

    if (dataAdded.modifiedCount === 0) {
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

    let data = await projectModel.updateOne(
      { _id: project._id },
      { $pull: { [extensionType]: extension } }
    );

    if (data.modifiedCount === 0) {
      throw Error('Project extensions could not be modified');
    }

    Utils.recordAction('Delete', 'Extension', user, project._id);
    return data;
  } catch (e) {
    throw Error('Project extension could not be deleted: ', e);
  }
};