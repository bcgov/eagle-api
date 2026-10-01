/**
 * Adding an Act is one registry entry: load the real constants.js with a made-up locked Act
 * added, and check that the helpers and the project controller (POST, PUT, publish) pick it up unchanged.
 *
 * Readers that build their lists at load time (project model, utils, aggregators, recentActivity,
 * report views, demiPush, demi-repush) are not reloaded here. They derive from LEGISLATION_KEYS,
 * and the guards in test/helpers/constants.test.js fail when an Act lacks a schema block.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const mongoose = require('mongoose');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');

const CONSTANTS_PATH = require.resolve('../../api/helpers/constants');
const CONTROLLER_PATH = require.resolve('../../api/controllers/project');
const REGISTRY_OPEN = 'const LEGISLATIONS = Object.freeze({\n';
const MADE_UP_ACT = "  2031: Object.freeze({ label: 'Coastal Review Act', locked: true }),\n";

const PROJ_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const LEAD_ID = '5f4c7d1e2b3a4c5d6e7f8092';
const EPD_ID = '5f4c7d1e2b3a4c5d6e7f8093';

function loadConstantsWithMadeUpAct() {
  const source = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  expect(source, 'registry declaration moved; update REGISTRY_OPEN').to.include(REGISTRY_OPEN);
  const patched = new Module(CONSTANTS_PATH, module);
  patched.filename = CONSTANTS_PATH;
  patched.paths = Module._nodeModulePaths(path.dirname(CONSTANTS_PATH));
  patched._compile(source.replace(REGISTRY_OPEN, REGISTRY_OPEN + MADE_UP_ACT), CONSTANTS_PATH);
  patched.loaded = true;
  return patched;
}

describe('Registry with a made-up locked Act (2031)', () => {
  let constants, controller, originalConstants, originalController;

  before(() => {
    originalConstants = require.cache[CONSTANTS_PATH];
    originalController = require.cache[CONTROLLER_PATH];
    const patched = loadConstantsWithMadeUpAct();
    constants = patched.exports;
    require.cache[CONSTANTS_PATH] = patched;
    delete require.cache[CONTROLLER_PATH];
    controller = require(CONTROLLER_PATH);
  });

  after(() => {
    require.cache[CONSTANTS_PATH] = originalConstants;
    require.cache[CONTROLLER_PATH] = originalController;
  });

  describe('helpers', () => {
    it('builds and reads back its key', () => {
      expect(constants.legislationKey(2031)).to.equal('legislation_2031');
      expect(constants.legislationYearOf('legislation_2031')).to.equal(2031);
    });

    it('adds it to the keys and the locked keys, default unchanged', () => {
      expect(constants.LEGISLATION_KEYS).to.include('legislation_2031');
      expect(constants.LOCKED_KEYS).to.deep.equal(['legislation_2025', 'legislation_2031']);
      expect(constants.DEFAULT_LEGISLATION_YEAR).to.equal(2002);
    });

    it('adds a $switch branch for it', () => {
      expect(constants.legislationSwitch().$switch.branches).to.deep.include({
        case: { $eq: ['$currentLegislationYear', 'legislation_2031'] },
        then: '$legislation_2031'
      });
    });
  });

  describe('project controller', () => {
    let res, projectModel;

    beforeEach(() => {
      // A constructor, for POST's `new Project()`, carrying the query stubs PUT and publish call.
      projectModel = function FakeProject(init) {
        Object.assign(this, init, { legislationYearList: [] });
      };
      projectModel.prototype.save = function () { return Promise.resolve(this); };
      Object.assign(projectModel, {
        findById: sinon.stub(),
        findOne: sinon.stub(),
        findOneAndUpdate: sinon.stub().resolves({ _id: PROJ_ID }),
        exists: sinon.stub().resolves(null)
      });
      res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      sinon.stub(mongoose, 'model').callsFake(name => (name === 'Project' ? projectModel : {}));
      sinon.stub(Utils, 'recordAction').resolves();
      sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
      sinon.stub(demiPush, 'project').resolves();
    });

    afterEach(() => sinon.restore());

    describe('protectedPut', () => {
      let storedProject;

      function putArgs(legislationYear) {
        return {
          swagger: {
            params: {
              projId: { value: PROJ_ID },
              auth_payload: { preferred_username: 'tester' },
              ProjObject: { value: { legislationYear, name: 'Renamed', projectLeadId: LEAD_ID, responsibleEPDId: EPD_ID } }
            }
          }
        };
      }

      function storeUnder(year) {
        storedProject = {
          _id: PROJ_ID,
          currentLegislationYear: 'legislation_' + year,
          legislationYearList: [year],
          ['legislation_' + year]: { name: 'Old', phaseHistory: [] }
        };
        projectModel.findById.resolves(storedProject);
      }

      it('refuses to move a 2031 project to 2018, naming the Act', async () => {
        storeUnder(2031);

        await controller.protectedPut(putArgs(2018), res);

        expect(res.status.firstCall.args[0]).to.equal(409);
        expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project is under the Coastal Review Act' });
        expect(projectModel.findOneAndUpdate.called).to.be.false;
      });

      it('writes a 2031 project under 2031 with its label, guarding only the other locked Act', async () => {
        storeUnder(2031);

        await controller.protectedPut(putArgs(2031), res);

        const [filter, update] = projectModel.findOneAndUpdate.firstCall.args;
        expect(res.status.firstCall.args[0]).to.equal(200);
        expect(filter.currentLegislationYear).to.deep.equal({ $nin: ['legislation_2025'] });
        expect(update.$set.currentLegislationYear).to.equal('legislation_2031');
        expect(update.$set.legislation_2031.legislation).to.equal('Coastal Review Act');
      });

      it('guards a 2018 write against both locked Acts and refuses when it lost the race', async () => {
        storeUnder(2018);
        projectModel.findOneAndUpdate.resolves(null);
        projectModel.exists.resolves({ _id: PROJ_ID });

        await controller.protectedPut(putArgs(2018), res);

        const locked = ['legislation_2025', 'legislation_2031'];
        expect(projectModel.findOneAndUpdate.firstCall.args[0].currentLegislationYear).to.deep.equal({ $nin: locked });
        expect(projectModel.exists.firstCall.args[0].currentLegislationYear).to.deep.equal({ $in: locked });
        expect(res.status.firstCall.args[0]).to.equal(409);
        expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project is under the Building Canada Act or the Coastal Review Act' });
      });
    });

    describe('protectedPublish', () => {
      let stored;

      function publishArgs(legislationYear) {
        return {
          swagger: {
            params: {
              projId: { value: PROJ_ID },
              auth_payload: { preferred_username: 'tester' },
              ProjObject: { value: { legislationYear } }
            }
          }
        };
      }

      function storeUnder(year, blocks) {
        stored = {
          _id: PROJ_ID,
          read: ['staff'],
          currentLegislationYear: 'legislation_' + year,
          legislationYearList: Object.keys(blocks).map(Number),
          save: sinon.stub().callsFake(function () { return Promise.resolve(this); })
        };
        Object.keys(blocks).forEach(blockYear => { stored['legislation_' + blockYear] = blocks[blockYear]; });
        projectModel.findOne.resolves(stored);
      }

      it('refuses to publish a 2031 project naming 2018, naming the Act', async () => {
        storeUnder(2031, { 2018: { name: 'Old' }, 2031: { name: 'Coastal' } });

        await controller.protectedPublish(publishArgs(2018), res);

        expect(res.status.firstCall.args[0]).to.equal(409);
        expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project is under the Coastal Review Act' });
        expect(stored.save.called).to.be.false;
      });

      it('refuses to move a 2018 project to 2031 when it has no 2031 content', async () => {
        storeUnder(2018, { 2018: { name: 'Old' } });

        await controller.protectedPublish(publishArgs(2031), res);

        expect(res.status.firstCall.args[0]).to.equal(409);
        expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Project has no content under legislation year 2031' });
        expect(stored.save.called).to.be.false;
      });

      it('moves a 2018 project with 2031 content to 2031, guarding only the other locked Act', async () => {
        storeUnder(2018, { 2018: { name: 'Old' }, 2031: { name: 'Coastal' } });

        await controller.protectedPublish(publishArgs(2031), res);

        expect(res.status.firstCall.args[0]).to.equal(200);
        expect(stored.$where).to.deep.equal({ currentLegislationYear: { $nin: ['legislation_2025'] } });
        expect(stored.currentLegislationYear).to.equal('legislation_2031');
        expect(stored.read).to.include('public');
      });
    });

    describe('protectedPost', () => {
      it('creates a 2031 project under its key and label', async () => {
        const answered = new Promise(resolve => res.json.callsFake(resolve));
        const project = { legislationYear: 2031, name: 'Harbour Crossing', proponent: LEAD_ID, responsibleEPDId: EPD_ID, projectLeadId: LEAD_ID };

        await controller.protectedPost({ swagger: { params: { project: { value: project }, auth_payload: { preferred_username: 'tester' } } } }, res);
        const created = await answered;

        expect(res.status.firstCall.args[0]).to.equal(200);
        expect(created.currentLegislationYear).to.equal('legislation_2031');
        expect(created.legislationYearList).to.deep.equal([2031]);
        expect(created.legislation_2031.legislation).to.equal('Coastal Review Act');
      });
    });
  });
});
