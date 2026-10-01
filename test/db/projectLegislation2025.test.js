/**
 * Building Canada Act (legislation_2025) projects read and saved against a real MongoDB.
 *
 * Every read flattens a project out of the block its currentLegislationYear names. A year the
 * $switch does not know falls back to legislation_2002, which on a 2025 project is empty, so the
 * row would come back with no name.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');
const projectController = require('../../api/controllers/project');
const searchController = require('../../api/controllers/search');

const { TEST_URI, id, PUBLIC_READ, capture, searchArgs, idsIn } = require('./parentReadFixtures');

const BCA_PROJECT = id('58990017d334ee001d625a01');
const BC_PROJECT = id('58990017d334ee001d625a02');
const PROPONENT = id('58990017d334ee001d625b01');

const FIXTURES = [
  { _id: PROPONENT, _schemaName: 'Organization', read: PUBLIC_READ, name: 'Northwind Crossings Ltd' },
  {
    _id: BCA_PROJECT,
    _schemaName: 'Project',
    read: PUBLIC_READ,
    currentLegislationYear: 'legislation_2025',
    legislationYearList: [2025],
    legislation_2025: {
      name: 'Harbour Crossing',
      type: 'Transportation',
      region: 'Lower Mainland',
      legislation: 'Building Canada Act',
      proponent: PROPONENT
    },
    // A POST fills the blocks it did not use with empty values; this is the one the fallback reads.
    legislation_2002: { name: '', type: '', region: '' }
  },
  {
    _id: BC_PROJECT,
    _schemaName: 'Project',
    read: PUBLIC_READ,
    currentLegislationYear: 'legislation_2018',
    legislationYearList: [2018],
    legislation_2018: { name: 'Inland Mine', type: 'Mines', region: 'Skeena', legislation: '2018 Environmental Assessment Act' }
  }
];

function projectArgs(roles, projId) {
  return {
    swagger: {
      operation: { 'x-security-scopes': roles },
      params: {
        projId: { value: projId ? String(projId) : undefined },
        fields: { value: ['name', 'type', 'region', 'legislation'] },
        pageSize: { value: 100 },
        pageNum: { value: 0 },
        auth_payload: { realm_access: { roles }, preferred_username: roles.join(',') }
      }
    }
  };
}

// Rows as each route returns them: a bare array, /project's counted list, or a search facet.
const rowFor = (data, _id) => {
  const rows = (data[0] && (data[0].searchResults || data[0].results)) || data;
  return rows.find(row => String(row._id) === String(_id));
};

describe('Building Canada Act projects (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(demiPush, 'project').resolves();
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  it('GET /public/project lists a 2025 project with the name from its 2025 block', async () => {
    const { res, body } = capture();
    await projectController.publicGet(projectArgs(['public']), res);

    expect(body.code).to.equal(200);
    expect(rowFor(body.data, BCA_PROJECT)).to.include({ name: 'Harbour Crossing', type: 'Transportation' });
    expect(rowFor(body.data, BC_PROJECT)).to.include({ name: 'Inland Mine' });
  });

  it('GET /public/project/:id serves a 2025 project from its 2025 block', async () => {
    const { res, body } = capture();
    await projectController.publicGet(projectArgs(['public'], BCA_PROJECT), res);

    expect(body.code).to.equal(200);
    expect(body.data).to.have.lengthOf(1);
    expect(body.data[0]).to.include({ name: 'Harbour Crossing', legislation: 'Building Canada Act' });
  });

  it('GET /project lists a 2025 project with the name from its 2025 block', async () => {
    const { res, body } = capture();
    await projectController.protectedGet(projectArgs(['staff']), res);

    expect(body.code).to.equal(200);
    expect(rowFor(body.data, BCA_PROJECT)).to.include({ name: 'Harbour Crossing', region: 'Lower Mainland' });
  });

  it('GET /project/:id serves a 2025 project from its 2025 block, proponent joined', async () => {
    const { res, body } = capture();
    await projectController.protectedGet(projectArgs(['staff'], BCA_PROJECT), res);

    expect(body.code).to.equal(200);
    expect(body.data[0]).to.include({ name: 'Harbour Crossing', legislation: 'Building Canada Act' });
    expect(body.data[0].proponent.name).to.equal('Northwind Crossings Ltd');
  });

  it('admin project search (default legislation) shows a 2025 project with its name', async () => {
    const { res, body } = capture();
    await searchController.protectedGet(searchArgs({ dataset: 'Project', projectLegislation: 'default', sortBy: '+name' }), res);

    expect(body.code).to.equal(200);
    expect(rowFor(body.data, BCA_PROJECT)).to.include({ name: 'Harbour Crossing' });
  });

  it('public project search shows a 2025 project with its name', async () => {
    const { res, body } = capture();
    await searchController.publicGet(searchArgs({ dataset: 'Project', roles: ['public'] }), res);

    expect(body.code).to.equal(200);
    expect(rowFor(body.data, BCA_PROJECT)).to.include({ name: 'Harbour Crossing' });
  });

  it('a project search filtered on a field finds the 2025 project by its 2025 block', async () => {
    const args = searchArgs({ dataset: 'Project', projectLegislation: 'default' });
    args.swagger.params.and = { value: 'type=Transportation' };
    const { res, body } = capture();
    await searchController.protectedGet(args, res);

    expect(idsIn(body.data)).to.deep.equal([String(BCA_PROJECT)]);
  });

  it('saving a 2025 project swaps and signs its centroid like the other blocks', async () => {
    const Project = mongoose.model('Project');
    // Entered as [lat, positive lon]; stored as [negative lon, lat].
    await new Project({
      _schemaName: 'Project',
      currentLegislationYear: 'legislation_2025',
      legislation_2025: { name: 'Centroid Check', centroid: [49.2, 123.1] }
    }).save();

    const stored = await mongoose.connection.collection('epic').findOne({ 'legislation_2025.name': 'Centroid Check' });
    expect(stored.legislation_2025.centroid).to.deep.equal([-123.1, 49.2]);
  });

  function writeArgs(projId, ProjObject) {
    return {
      swagger: {
        params: {
          projId: { value: String(projId) },
          ProjObject: { value: ProjObject },
          auth_payload: { realm_access: { roles: ['sysadmin'] }, preferred_username: 'sysadmin' }
        }
      }
    };
  }

  const storedRow = (_id) => mongoose.connection.collection('epic').findOne({ _id });

  it('publish naming 2025 on a 2018 project is refused and leaves the project as it was', async () => {
    const { res, body } = capture();
    await projectController.protectedPublish(writeArgs(BC_PROJECT, { legislationYear: 2025 }), res);

    expect(body.code).to.equal(409);
    const stored = await storedRow(BC_PROJECT);
    expect(stored.currentLegislationYear).to.equal('legislation_2018');
    expect(stored.legislationYearList).to.deep.equal([2018]);
    expect(stored).to.not.have.property('legislation_2025');
  });

  describe('publish naming 2002 on an unpublished 2018 project with 2002 content', () => {
    const publish = (res) => projectController.protectedPublish(writeArgs(BC_PROJECT, { legislationYear: 2002 }), res);

    beforeEach(async () => {
      await mongoose.connection.collection('epic').updateOne(
        { _id: BC_PROJECT },
        { $set: { read: ['staff', 'sysadmin'], legislationYearList: [2002, 2018], legislation_2002: { name: 'Inland Mine (2002)' } } }
      );
    });

    it('publishes it under 2002', async () => {
      const { res, body } = capture();
      await publish(res);

      expect(body.code).to.equal(200);
      const stored = await storedRow(BC_PROJECT);
      expect(stored.currentLegislationYear).to.equal('legislation_2002');
      expect(stored.read).to.include('public');
    });

    it('is refused when the project moved under the Building Canada Act after the handler read it', async () => {
      const Project = mongoose.model('Project');
      const stale = await Project.findOne({ _id: BC_PROJECT });
      await mongoose.connection.collection('epic').updateOne(
        { _id: BC_PROJECT },
        { $set: { currentLegislationYear: 'legislation_2025', legislation_2025: { name: 'Moved' } } }
      );
      // Only the handler's read is stale; Project.exists() calls findOne() too.
      sinon.stub(Project, 'findOne').callThrough().onFirstCall().resolves(stale);

      const { res, body } = capture();
      await publish(res);

      expect(body.code).to.equal(409);
      expect(body.data).to.deep.equal({ message: 'Project is under the Building Canada Act' });
      expect(demiPush.project.called).to.be.false;
      const stored = await storedRow(BC_PROJECT);
      expect(stored.currentLegislationYear).to.equal('legislation_2025');
      expect(stored.read).to.not.include('public');
    });
  });

  describe('PUT naming 2018', () => {
    const put = (res) => projectController.protectedPut(writeArgs(BC_PROJECT, { legislationYear: 2018, name: 'Inland Mine Renamed' }), res);

    it('writes the 2018 block of a 2018 project', async () => {
      const { res, body } = capture();
      await put(res);

      expect(body.code).to.equal(200);
      expect((await storedRow(BC_PROJECT)).legislation_2018.name).to.equal('Inland Mine Renamed');
    });

    it('is refused when the project moved under the Building Canada Act after the handler read it', async () => {
      const Project = mongoose.model('Project');
      const stale = await Project.findById(BC_PROJECT);
      await mongoose.connection.collection('epic').updateOne(
        { _id: BC_PROJECT },
        { $set: { currentLegislationYear: 'legislation_2025', legislationYearList: [2018, 2025], legislation_2025: { name: 'Moved' } } }
      );
      sinon.stub(Project, 'findById').resolves(stale);

      const { res, body } = capture();
      await put(res);

      expect(body.code).to.equal(409);
      expect(body.data).to.deep.equal({ message: 'Project is under the Building Canada Act' });
      const stored = await storedRow(BC_PROJECT);
      expect(stored.currentLegislationYear).to.equal('legislation_2025');
      expect(stored.legislation_2018.name).to.equal('Inland Mine');
    });
  });
});
