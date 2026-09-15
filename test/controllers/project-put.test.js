/**
 * protectedPut writes back only the fields it rebuilt, so a publish that lands between the
 * read and the write keeps its `read` array.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');
const projectController = require('../../api/controllers/project');

const PROJ_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const LEAD_ID = '5f4c7d1e2b3a4c5d6e7f8092';
const EPD_ID = '5f4c7d1e2b3a4c5d6e7f8093';

describe('Project protectedPut', () => {
  let res, projectModel, storedProject;

  function putArgs() {
    return {
      swagger: {
        params: {
          projId: { value: PROJ_ID },
          auth_payload: { preferred_username: 'tester' },
          ProjObject: {
            value: {
              legislationYear: 2018,
              name: 'Renamed Project',
              description: 'new description',
              type: 'Energy-Electricity',
              projectLeadId: LEAD_ID,
              responsibleEPDId: EPD_ID,
              intake: { investment: '100', notes: 'note' },
              // A client may echo the permission arrays back; the handler must ignore them.
              read: ['sysadmin'],
              write: ['sysadmin'],
              delete: ['sysadmin']
            }
          }
        }
      }
    };
  }

  beforeEach(() => {
    // Snapshot as it stood before a concurrent publish pushed 'public' onto read.
    storedProject = {
      _id: PROJ_ID,
      __v: 3,
      read: ['sysadmin', 'staff'],
      write: ['sysadmin'],
      delete: ['sysadmin'],
      currentLegislationYear: 'legislation_2018',
      legislationYearList: [2018],
      legislation_2018: {
        name: 'Old Project',
        description: 'old description',
        phaseHistory: []
      }
    };

    projectModel = {
      findById: sinon.stub().resolves(storedProject),
      findOneAndUpdate: sinon.stub().resolves({ _id: PROJ_ID, name: 'Renamed Project' })
    };

    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };

    sinon.stub(mongoose, 'model').callsFake(name => (name === 'Project' ? projectModel : {}));
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(demiPush, 'project').resolves();
  });

  afterEach(() => sinon.restore());

  function updateArg() {
    expect(projectModel.findOneAndUpdate.calledOnce).to.be.true;
    return projectModel.findOneAndUpdate.firstCall.args[1];
  }

  it('does not write the permission arrays back', async () => {
    await projectController.protectedPut(putArgs(), res);

    const update = updateArg();
    const fields = update.$set || update;
    expect(update).to.not.have.property('read');
    expect(fields).to.not.have.property('read');
    expect(fields).to.not.have.property('write');
    expect(fields).to.not.have.property('delete');
  });

  it('does not write _id or the version key back', async () => {
    await projectController.protectedPut(putArgs(), res);

    const fields = updateArg().$set || updateArg();
    expect(fields).to.not.have.property('_id');
    expect(fields).to.not.have.property('__v');
  });

  it('still writes the legislation block it rebuilt', async () => {
    await projectController.protectedPut(putArgs(), res);

    const fields = updateArg().$set || updateArg();
    expect(fields.currentLegislationYear).to.equal('legislation_2018');
    expect(fields.legislation_2018.name).to.equal('Renamed Project');
    expect(fields.legislation_2018.description).to.equal('new description');
    expect(res.status.calledWith(200)).to.be.true;
    expect(demiPush.project.calledOnce).to.be.true;
  });

  it('adds a legislation year not already in the list', async () => {
    storedProject.legislation_2002 = {
      name: 'Old Project',
      description: 'old description',
      phaseHistory: []
    };

    const args = putArgs();
    args.swagger.params.ProjObject.value.legislationYear = 2002;

    await projectController.protectedPut(args, res);

    const fields = updateArg().$set || updateArg();
    expect(fields.legislationYearList).to.include(2002);
    expect(fields.currentLegislationYear).to.equal('legislation_2002');
    expect(fields.legislation_2002.name).to.equal('Renamed Project');
    expect(fields.legislation_2002.description).to.equal('new description');
  });
});
