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
const NEW_LEAD_ID = '5f4c7d1e2b3a4c5d6e7f8094';
const NEW_EPD_ID = '5f4c7d1e2b3a4c5d6e7f8095';

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
        projectLeadId: new mongoose.Types.ObjectId(LEAD_ID),
        projectLead: 'Old Lead',
        responsibleEPDId: new mongoose.Types.ObjectId(EPD_ID),
        responsibleEPD: 'Old EPD',
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

  it('does not add a year sent as a string that the list already holds', async () => {
    const args = putArgs();
    args.swagger.params.ProjObject.value.legislationYear = '2018';

    await projectController.protectedPut(args, res);

    const fields = updateArg().$set;
    expect(fields.legislationYearList).to.deep.equal([2018]);
    expect(fields.currentLegislationYear).to.equal('legislation_2018');
  });

  describe('lead and EPD ids', () => {
    function putWithContacts(set) {
      const args = putArgs();
      set(args.swagger.params.ProjObject.value);
      return args;
    }

    function storedBlock() {
      return (updateArg().$set || updateArg()).legislation_2018;
    }

    [
      ['are not sent', p => { delete p.projectLeadId; delete p.responsibleEPDId; }],
      ['are null', p => { p.projectLeadId = null; p.responsibleEPDId = null; }],
      ['are empty', p => { p.projectLeadId = ''; p.responsibleEPDId = ''; }]
    ].forEach(([label, set]) => {
      it(`stores null, not a new id, when they ${label}`, async () => {
        await projectController.protectedPut(putWithContacts(set), res);

        expect(res.status.firstCall.args[0]).to.equal(200);
        expect(storedBlock().projectLeadId).to.be.null;
        expect(storedBlock().responsibleEPDId).to.be.null;
      });
    });

    it('clears the stored lead and EPD names when the ids are cleared', async () => {
      await projectController.protectedPut(putWithContacts(p => { p.projectLeadId = ''; p.responsibleEPDId = null; }), res);

      expect(storedBlock().projectLead).to.equal('');
      expect(storedBlock().responsibleEPD).to.equal('');
    });

    it('stores the ids the request sends', async () => {
      await projectController.protectedPut(putWithContacts(p => {
        p.projectLeadId = NEW_LEAD_ID;
        p.responsibleEPDId = NEW_EPD_ID;
      }), res);

      expect(storedBlock().projectLeadId).to.be.instanceOf(mongoose.Types.ObjectId);
      expect(String(storedBlock().projectLeadId)).to.equal(NEW_LEAD_ID);
      expect(String(storedBlock().responsibleEPDId)).to.equal(NEW_EPD_ID);
    });

    it('keeps a sent lead and clears only a blank EPD, id and name', async () => {
      await projectController.protectedPut(putWithContacts(p => {
        p.projectLeadId = NEW_LEAD_ID;
        p.responsibleEPDId = '';
      }), res);

      expect(String(storedBlock().projectLeadId)).to.equal(NEW_LEAD_ID);
      expect(storedBlock().projectLead).to.equal('Old Lead');
      expect(storedBlock().responsibleEPDId).to.be.null;
      expect(storedBlock().responsibleEPD).to.equal('');
    });

    ['projectLeadId', 'responsibleEPDId'].forEach(field => {
      it(`answers 400 and writes nothing when ${field} is not a valid id`, async () => {
        await projectController.protectedPut(putWithContacts(p => { p[field] = 'not-an-id'; }), res);

        expect(res.status.firstCall.args[0]).to.equal(400);
        expect(projectModel.findById.called).to.be.false;
        expect(projectModel.findOneAndUpdate.called).to.be.false;
        expect(demiPush.project.called).to.be.false;
      });
    });
  });

  it('answers 404 and writes nothing for a year that is not a known Act', async () => {
    const args = putArgs();
    args.swagger.params.ProjObject.value.legislationYear = 2019;

    await projectController.protectedPut(args, res);

    expect(res.status.firstCall.args[0]).to.equal(404);
    expect(projectModel.findOneAndUpdate.called).to.be.false;
  });

  describe('on a Building Canada Act project', () => {
    beforeEach(() => {
      storedProject.currentLegislationYear = 'legislation_2025';
      storedProject.legislationYearList = [2025];
      delete storedProject.legislation_2018;
      storedProject.legislation_2025 = {
        name: 'Harbour Crossing',
        description: 'old description',
        phaseHistory: []
      };
    });

    it('writes the 2025 block when the request names 2025', async () => {
      const args = putArgs();
      args.swagger.params.ProjObject.value.legislationYear = 2025;

      await projectController.protectedPut(args, res);

      const fields = updateArg().$set;
      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(fields.currentLegislationYear).to.equal('legislation_2025');
      expect(fields.legislation_2025.name).to.equal('Renamed Project');
      expect(fields.legislation_2025.legislation).to.equal('Building Canada Act');
      expect(fields.legislationYearList).to.deep.equal([2025]);
    });

    it('writes the 2025 block when the request names no year', async () => {
      const args = putArgs();
      delete args.swagger.params.ProjObject.value.legislationYear;

      await projectController.protectedPut(args, res);

      const fields = updateArg().$set;
      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(fields.currentLegislationYear).to.equal('legislation_2025');
      expect(fields.legislation_2025.name).to.equal('Renamed Project');
    });

    [2018, 2019].forEach(year => {
      it(`refuses with 409 and writes nothing when the request names ${year}`, async () => {
        const args = putArgs();
        args.swagger.params.ProjObject.value.legislationYear = year;

        await projectController.protectedPut(args, res);

        expect(res.status.firstCall.args[0]).to.equal(409);
        expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project is under the Building Canada Act' });
        expect(projectModel.findOneAndUpdate.called).to.be.false;
        expect(demiPush.project.called).to.be.false;
      });
    });

    it('does not add the Building Canada Act condition to the write filter when the request names 2025', async () => {
      const args = putArgs();
      args.swagger.params.ProjObject.value.legislationYear = 2025;

      await projectController.protectedPut(args, res);

      expect(projectModel.findOneAndUpdate.firstCall.args[0]).to.not.have.property('currentLegislationYear');
    });
  });

  it('answers 404 and writes nothing when the project does not exist', async () => {
    projectModel.findById.resolves(null);

    await projectController.protectedPut(putArgs(), res);

    expect(res.status.firstCall.args[0]).to.equal(404);
    expect(projectModel.findOneAndUpdate.called).to.be.false;
    expect(demiPush.project.called).to.be.false;
  });

  describe('when the project moves under the Building Canada Act between the read and the write', () => {
    beforeEach(() => {
      // The stored project no longer matches the write filter.
      projectModel.findOneAndUpdate.resolves(null);
      projectModel.exists = sinon.stub().resolves({ _id: PROJ_ID });
    });

    it('writes only where the stored project is not under the Building Canada Act', async () => {
      await projectController.protectedPut(putArgs(), res);

      expect(projectModel.findOneAndUpdate.firstCall.args[0].currentLegislationYear).to.deep.equal({ $nin: ['legislation_2025'] });
    });

    it('refuses with 409 and pushes nothing', async () => {
      await projectController.protectedPut(putArgs(), res);

      expect(res.status.firstCall.args[0]).to.equal(409);
      expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project is under the Building Canada Act' });
      expect(projectModel.exists.firstCall.args[0].currentLegislationYear).to.deep.equal({ $in: ['legislation_2025'] });
      expect(demiPush.project.called).to.be.false;
    });

    it('still answers 404 when the project was deleted instead', async () => {
      projectModel.exists.resolves(null);

      await projectController.protectedPut(putArgs(), res);

      expect(res.status.firstCall.args[0]).to.equal(404);
      expect(res.json.firstCall.args[0]).to.deep.equal({});
    });
  });
});
