'use strict';

const sinon = require('sinon');
const defaultLog = require('winston').loggers.get('default');
const Actions = require('../../api/helpers/actions');
const projectNotification = require('../../api/controllers/projectNotification');
const ProjectNotification = require('../../api/helpers/models/projectNotification');
const { itHonoursCreateId } = require('../support/createIdHarness');
const { pnArgs } = require('../support/demiPushHarness');

describe('ProjectNotification Controller', () => {
  afterEach(() => sinon.restore());

  describe('protectedPost with a caller-supplied _id', () => {
    let sendResponse;

    beforeEach(() => {
      sendResponse = sinon.stub(Actions, 'sendResponse');
      sinon.stub(defaultLog, 'info');
      sinon.stub(defaultLog, 'error');
    });

    itHonoursCreateId(ProjectNotification, async _id => {
      const args = pnArgs();
      args.swagger.params.projectNotification.value._id = _id;
      await projectNotification.protectedPost(args, {});
      return sendResponse.lastCall.args[1];
    }, 201);
  });
});
