var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var Email = require('../helpers/email');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedPublishCAC = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  defaultLog.info('protectedPublishCAC for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var Project = mongoose.model('Project');
  try {
    var project = await Project.findOne({ _id: projId });
    if (project) {
      var published = await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $set: { 'projectCACPublished': true } }
      );
      Utils.recordAction('Publish', 'CAC', args.swagger.params.auth_payload.preferred_username, projId);
      defaultLog.info('Published CAC for project:', projId);
      return Actions.sendResponse(res, 200, published);
    } else {
      defaultLog.info('Project not found:', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error('Error publishing CAC for project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedUnPublishCAC = async function (args, res) {
  var projId = args.swagger.params.projId.value;
  defaultLog.info('protectedUnPublishCAC for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  var Project = mongoose.model('Project');
  try {
    var project = await Project.findOne({ _id: projId });
    if (project) {
      var updated = await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $set: { 'projectCACPublished': false } }
      );
      Utils.recordAction('Unpublish', 'CAC', args.swagger.params.auth_payload.preferred_username, projId);
      defaultLog.info('Unpublished CAC for project:', projId);
      return Actions.sendResponse(res, 200, updated);
    } else {
      defaultLog.info('Project not found:', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error('Error unpublishing CAC for project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.publicCACSignUp = async function (args, res) {
  const CACUser = mongoose.model('CACUser');
  const Project = mongoose.model('Project');

  let cacObject = args.swagger.params.cac.value;
  const projectId = args.swagger.params.projId.value;
  defaultLog.info('publicCACSignUp for project:', projectId);
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return Actions.sendResponse(res, 400, {});
  }
  delete cacObject.read;
  delete cacObject.write;

  cacObject.project = projectId;

  try {
    let cacUserToAdd = new CACUser(cacObject);

    // Find this email address in the cac list for this project
    let cacUser = await CACUser.findOne({
      _schemaName: 'CACUser',
      email: cacUserToAdd.email,
      project: new mongoose.Types.ObjectId(projectId)
    });

    if (!cacUser) {
      // Not found, create the cacUser
      cacUserToAdd.read.push('sysadmin');
      cacUserToAdd.write.push('sysadmin');
      cacUser = await cacUserToAdd.save();
    }

    const projectData = await Project.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(projectId) },
      { $addToSet: { 'cacMembers': new mongoose.Types.ObjectId(cacUser._id) } },
      { new: true }
    );
    Utils.recordAction('Post', 'ProjectCACMember', 'public', cacUser._id);

    if (projectData) {
      const projectName = projectData[projectData.currentLegislationYear].name;
      await Email.sendCACWelcomeEmail(projectId, projectName, cacUser.email);
    }
    defaultLog.info('Signed up CAC member for project:', projectId);
    return Actions.sendResponse(res, 200, {});
  } catch (e) {
    defaultLog.error('Error signing up CAC member for project:', projectId, e);
    return Actions.sendResponse(res, 500, {});
  }
};

exports.publicCACRemoveMember = async function (args, res) {
  const Project = mongoose.model('Project');
  const CACUser = mongoose.model('CACUser');

  const projId = args.swagger.params.projId.value;
  defaultLog.info('publicCACRemoveMember for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const cac = args.swagger.params.cac.value;

  try {
    const member = await CACUser.findOne({
      _schemaName: 'CACUser',
      email: cac.email,
      project: new mongoose.Types.ObjectId(projId)
    });

    if (member) {
      await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $pull: { cacMembers: { $in: [member._id] } } }
      );
      await CACUser.deleteOne({ _id: member._id });

      Utils.recordAction('Delete', 'CACMemberFromProject', 'public', member._id);
      defaultLog.info('Removed CAC member email:', cac.email, 'from project:', projId);
      return Actions.sendResponse(res, 200, {});
    } else {
      defaultLog.info('CAC member not found with email:', cac.email, 'in project:', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error('Error removing CAC member from project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedCACRemoveMember = async function (args, res) {
  const projId = args.swagger.params.projId.value;
  defaultLog.info('protectedCACRemoveMember for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const member = args.swagger.params.member.value;

  const Project = mongoose.model('Project');
  const CACUser = mongoose.model('CACUser');
  try {
    var projectData = await Project.updateOne(
      { _id: new mongoose.Types.ObjectId(projId) },
      { $pull: { cacMembers: { $in: [new mongoose.Types.ObjectId(member._id)] } } }
    );
    await CACUser.deleteOne({ _id: new mongoose.Types.ObjectId(member._id) });

    Utils.recordAction('Delete', 'CACMemberFromProject', args.swagger.params.auth_payload.preferred_username, member._id);
    defaultLog.info('Removed CAC member:', member._id, 'from project:', projId);
    return Actions.sendResponse(res, 200, projectData);
  } catch (e) {
    defaultLog.error('Error removing CAC member:', member._id, 'from project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedCreateCAC = async function (args, res) {
  const projId = args.swagger.params.projId.value;
  defaultLog.info('protectedCreateCAC for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const cacData = args.swagger.params.data.value;
  const Project = mongoose.model('Project');

  try {
    let data = await Project.updateOne(
      { _id: new mongoose.Types.ObjectId(projId) },
      { projectCAC: true, cacEmail: cacData.cacEmail, projectCACPublished: false }
    );
    if (data.modifiedCount === 0) {
      defaultLog.info('No project found to update for CAC creation:', projId);
      return Actions.sendResponse(res, 400, {});
    }
    Utils.recordAction('Post', 'Add Project CAC', args.swagger.params.auth_payload.preferred_username, projId);
    defaultLog.info('Created CAC for project:', projId);
    return Actions.sendResponse(res, 201, data);
  } catch (e) {
    defaultLog.error('Error creating CAC for project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedCACDelete = async function (args, res) {
  const projId = args.swagger.params.projId.value;
  defaultLog.info('protectedCACDelete for project:', projId);
  if (!mongoose.Types.ObjectId.isValid(projId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const Project = mongoose.model('Project');
  const CACUser = mongoose.model('CACUser');
  try {
    const proj = await Project.findOne({ _id: new mongoose.Types.ObjectId(projId) });
    if (!proj) {
      defaultLog.info('Project not found for CAC delete:', projId);
      return Actions.sendResponse(res, 404, {});
    }
    await CACUser.deleteMany({ _id: { $in: proj.cacMembers } });

    const data = await Project.updateOne(
      { _id: new mongoose.Types.ObjectId(projId) },
      { projectCAC: false, cacMembers: [] }
    );
    if (data.modifiedCount === 0) {
      defaultLog.info('No project found to update for CAC delete:', projId);
      return Actions.sendResponse(res, 400, {});
    }
    Utils.recordAction('Post', 'Remove Project CAC', args.swagger.params.auth_payload.preferred_username, projId);
    defaultLog.info('Deleted CAC for project:', projId);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error('Error deleting CAC for project:', projId, e);
    return Actions.sendResponse(res, 400, e);
  }
};
