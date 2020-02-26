// Imports
const defaultLog = require('winston').loggers.get('default');
const Actions    = require('../helpers/actions');
const projectDAO = require('../dao/projectDAO');
const pinDAO     = require('../dao/pinDAO');
const constants  = require('../helpers/constants');

// OPTIONS
exports.pinOptions = function (args, res) {
  res.status(200).send();
};

exports.pinOptionsProtected = function (args, res) {
  res.status(200).send();
};

// GET (Public, getPin)
exports.fetchPins = async function (args, res) {
  defaultLog.debug('>>> {GET}/Public/Projects/{id}/Pins');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId')) {
      let projectId = args.swagger.params.projId.value;

      defaultLog.debug(' Fetching pins for project: ' + projectId);

      let project = await projectDAO.getProject(constants.PUBLIC_ROLES, projectId);

      if(project) {
        let pageNumber = Object.prototype.hasOwnProperty.call(args.swagger.params, 'pageNumber') && args.swagger.params.pageNumber.value ? args.swagger.params.pageNumber.value : 1;
        let pageSize   = Object.prototype.hasOwnProperty.call(args.swagger.params, 'pageSize')   && args.swagger.params.pageSize.value   ? args.swagger.params.pageSize.value   : 10;
        let sortBy     = Object.prototype.hasOwnProperty.call(args.swagger.params, 'sortBy')     && args.swagger.params.sortBy.value     ? args.swagger.params.sortBy.value     : '';

        let data = await pinDAO.getProjectPins('Public User', constants.PUBLIC_ROLES, project, pageNumber, pageSize, sortBy);

        return data ? Actions.sendResponseV2(res, 200, data)
          : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pins were not found'});
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {GET}/Public/Projects/{id}/Pins :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Public/Projects/{id}/Pins' });
  } finally {
    defaultLog.debug('<<< {GET}/Public/Projects/{id}/Pins');
  }
};

// GET (Protected Only, getPin)
exports.fetchPinsProtected = async function (args, res) {
  defaultLog.debug('>>> {GET}/Projects/{id}/Pins');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId')) {
      let projectId = args.swagger.params.projId.value;

      defaultLog.debug(' Fetching pins for project: ' + projectId);

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project) {
        let pageNumber = Object.prototype.hasOwnProperty.call(args.swagger.params, 'pageNumber') && args.swagger.params.pageNumber.value ? args.swagger.params.pageNumber.value : 1;
        let pageSize   = Object.prototype.hasOwnProperty.call(args.swagger.params, 'pageSize')   && args.swagger.params.pageSize.value   ? args.swagger.params.pageSize.value   : 10;
        let sortBy     = Object.prototype.hasOwnProperty.call(args.swagger.params, 'sortBy')     && args.swagger.params.sortBy.value     ? args.swagger.params.sortBy.value     : '';

        let data = await pinDAO.getProjectPins(args.swagger.params.auth_payload.preferred_username, constants.SECURE_ROLES, project, pageNumber, pageSize, sortBy);

        return data ? Actions.sendResponseV2(res, 200, data)
          : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pins were not found'});
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {GET}/Projects/{id}/Pins :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins' });
  } finally {
    defaultLog.debug('<<< {GET}/Projects/{id}/Pins');
  }
};

// POST (Protected Only, createPin)
exports.pinCreate = async function (args, res) {
  defaultLog.debug('>>> {POST}/Projects/{id}/Pins');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId')) {
      let projectId = args.swagger.params.projId.value;

      defaultLog.debug(' Creating pin for project: ' + projectId);

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project) {
        let pins = args.swagger.params.pins;

        if(pins) {
          let data = await pinDAO.createPin(args.swagger.params.auth_payload.preferred_username, project, pins);

          return data ? Actions.sendResponseV2(res, 201, data)
            : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pins were not found'});
        } else {
          throw Error('Invalid request');
        }
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {POST}/Projects/{id}/Pins :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins' });
  } finally {
    defaultLog.debug('<<< {POST}/Projects/{id}/Pins');
  }
};

// PUT (Protected Only, publishPin)
exports.publishPin = async function (args, res) {
  defaultLog.debug('>>> {PUT}/Projects/{id}/Pins/Publish');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId')) {
      let projectId = args.swagger.params.projId.value;

      defaultLog.debug(' Publishing pins for project: ' + projectId);

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project) {
        let publishedProject = await pinDAO.publishPins(args.swagger.params.auth_payload.preferred_username, project);

        return publishedProject ? Actions.sendResponseV2(res, 200, publishedProject)
          : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pins were not found or could not be published'});
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {PUT}/Projects/{id}/Pins/Publish :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins/Publish' });
  } finally {
    defaultLog.debug('<<< {PUT}/Projects/{id}/Pins/Publish');
  }
};

// PUT (Protected Only, unPublishPin)
exports.unpublishPin = async function (args, res) {
  defaultLog.debug('>>> {PUT}/Projects/{id}/Pins/Unpublish');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId')) {
      let projectId = args.swagger.params.projId.value;

      defaultLog.debug(' Un-Publishing pins for project: ' + projectId);

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project) {
        let publishedProject = await pinDAO.unPublishPins(args.swagger.params.auth_payload.preferred_username, project);

        return publishedProject ? Actions.sendResponseV2(res, 200, publishedProject)
          : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pins were not found or could not be published'});
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {PUT}/Projects/{id}/Pins/Unpublish :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{id}/Pins/Unpublish' });
  } finally {
    defaultLog.debug('<<< {PUT}/Projects/{id}/Pins/Unpublish');
  }
};

// DELETE (Protected Only, deletePin)
exports.deletePin = async function (args, res) {
  defaultLog.debug('>>> {DELETE}/Projects/{projId}/Pins/{pinId}');

  try {
    if (Object.prototype.hasOwnProperty.call(args.swagger.params, 'projId') && Object.prototype.hasOwnProperty.call(args.swagger.params, 'pinId')) {
      let projectId = args.swagger.params.projId.value;
      let pinId = args.swagger.params.pinId.value;

      defaultLog.debug(' Deleting pin ' + pinId + ' for project: ' + projectId);

      let project = await projectDAO.getProject(constants.SECURE_ROLES, projectId);

      if(project) {
        project = pinDAO.deletePin(args.swagger.params.auth_payload.preferred_username, pinId, project);

        // TODO: Fix this!
        //return publishedProject ? Actions.sendResponseV2(res, 200, project)
        //                       : Actions.sendResponseV2(res, 404, { code: 404, message: 'Project pin was not found or could not be deleted'});
      } else {
        return Actions.sendResponseV2(res, 404, { status: 404, message: 'Project ' + projectId + ' not found.'});
      }
    } else {
      throw Error('Invalid request');
    }
  } catch (e) {
    defaultLog.error('### Error in {DELETE}/Projects/{projId}/Pins/{pinId} :', e);
    return Actions.sendResponseV2(res, 500, { code: '500', message: 'Internal Server Error', self: 'Api/Projects/{projId}/Pins/{pinId}' });
  } finally {
    defaultLog.debug('<<< {DELETE}/Projects/{projId}/Pins/{pinId}');
  }
};