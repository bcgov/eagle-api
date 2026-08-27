const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const projectDAO = require('../../api/dao/projectDAO');

describe('projectDAO publish audit', () => {
  const project = { _id: new mongoose.Types.ObjectId(), legislationYear: 2018 };

  beforeEach(() => {
    sinon.stub(Actions, 'publish').resolves(project);
    sinon.stub(Actions, 'unPublish').resolves(project);
    sinon.stub(Utils, 'recordAction').resolves();
  });

  afterEach(() => sinon.restore());

  it('unPublishProject records action Unpublish on Project', async () => {
    await projectDAO.unPublishProject('user', project);
    expect(Utils.recordAction.calledWith('Unpublish', 'Project', 'user', project._id)).to.be.true;
  });

  it('publishProject records action Publish on Project', async () => {
    await projectDAO.publishProject('user', project);
    expect(Utils.recordAction.calledWith('Publish', 'Project', 'user', project._id)).to.be.true;
  });
});
