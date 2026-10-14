var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var Email = require('../helpers/email');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// These routes are anonymous, so anything but a plain address string (an operator object such as
// {"$ne": ""}) must never reach a query. Returns the trimmed address, or null.
function cleanEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(email) ? email : null;
}

exports.publicCACSignUp = async function (args, res) {
  const cacObject = args.swagger.params.cac.value;
  const projectId = args.swagger.params.projId.value;
  defaultLog.info('publicCACSignUp for project:', projectId);
  const email = cleanEmail(cacObject && cacObject.email);
  if (!Utils.isObjectIdString(projectId) || !email) {
    return Actions.sendResponse(res, 400, {});
  }
  const CACUser = mongoose.model('CACUser');
  const Project = mongoose.model('Project');
  delete cacObject.read;
  delete cacObject.write;

  cacObject.email = email;
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
      { returnDocument: 'after' }
    );
    Utils.recordAction('Post', 'ProjectCACMember', 'public', cacUser._id);

    if (projectData) {
      const projectName = projectData[projectData.currentLegislationYear].name;
      await Email.sendCACWelcomeEmail(projectId, projectName, cacUser.email);
    }
    defaultLog.info('Signed up CAC member for project:', projectId);
    return Actions.sendResponse(res, 200, {});
  } catch (e) {
    defaultLog.error(`Error signing up CAC member for project: ${projectId}: ${e.message}`);
    return Actions.sendResponse(res, 500, {});
  }
};

exports.publicCACRemoveMember = async function (args, res) {
  const projId = args.swagger.params.projId.value;
  defaultLog.info('publicCACRemoveMember for project:', projId);
  const cac = args.swagger.params.cac.value;
  const email = cleanEmail(cac && cac.email);
  if (!Utils.isObjectIdString(projId) || !email) {
    return Actions.sendResponse(res, 400, {});
  }
  const Project = mongoose.model('Project');
  const CACUser = mongoose.model('CACUser');

  try {
    const member = await CACUser.findOne({
      _schemaName: 'CACUser',
      email: email,
      project: new mongoose.Types.ObjectId(projId)
    });

    if (member) {
      await Project.updateOne(
        { _id: new mongoose.Types.ObjectId(projId) },
        { $pull: { cacMembers: { $in: [member._id] } } }
      );
      await CACUser.deleteOne({ _id: member._id });

      Utils.recordAction('Delete', 'CACMemberFromProject', 'public', member._id);
      defaultLog.info('Removed CAC member %s from project %s', member._id, projId);
      return Actions.sendResponse(res, 200, {});
    } else {
      defaultLog.info('CAC member to remove not found in project %s', projId);
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error removing CAC member from project: ${projId}: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};
