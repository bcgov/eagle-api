'use strict';

const sinon = require('sinon');
const defaultLog = require('winston').loggers.get('default');
const Actions = require('../../api/helpers/actions');
const organization = require('../../api/controllers/organization');
const Organization = require('../../api/helpers/models/organization');
const { itHonoursCreateId } = require('../support/createIdHarness');
const { orgArgs } = require('../support/demiPushHarness');

describe('Organization Controller', () => {
  afterEach(() => sinon.restore());

  describe('protectedPost with a caller-supplied _id', () => {
    let sendResponse;

    beforeEach(() => {
      sendResponse = sinon.stub(Actions, 'sendResponse');
      sinon.stub(defaultLog, 'info');
      sinon.stub(defaultLog, 'error');
    });

    itHonoursCreateId(Organization, async _id => {
      const args = orgArgs();
      args.swagger.params.org.value._id = _id;
      await organization.protectedPost(args, {});
      return sendResponse.lastCall.args[1];
    });
  });
});
