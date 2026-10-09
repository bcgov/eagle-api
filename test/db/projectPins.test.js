/**
 * Project pins against a real MongoDB: adding pins never stores an id twice, and the cleanup script
 * finds and repairs projects that already do.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const pinsController = require('../../api/controllers/pins');
const { dedupe } = require('../../scripts/dedupe-project-pins');
const { TEST_URI, id, capture } = require('./parentReadFixtures');

const A = id('58990017d334ee001d60a001');
const B = id('58990017d334ee001d60a002');
const C = id('58990017d334ee001d60a003');
const PINNED = id('58990017d334ee001d60b001');
const REPEATED = id('58990017d334ee001d60b002');
const CLEAN = id('58990017d334ee001d60b003');
const UNPINNED = id('58990017d334ee001d60b004');

const project = (_id, pins) => Object.assign(
  { _id, _schemaName: 'Project', currentLegislationYear: 'legislation_2018', legislation_2018: { name: 'p ' + _id } },
  pins ? { pins } : {}
);

const addArgs = (projId, pins) => ({
  swagger: {
    params: {
      projId: { value: String(projId) },
      pins: { value: pins.map(String) },
      auth_payload: { preferred_username: 'testuser' }
    }
  }
});

const storedPins = async (_id) => (await mongoose.connection.collection('epic').findOne({ _id })).pins.map(String);

describe('project pins (requires MongoDB)', function () {
  this.timeout(30000);

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany([
      project(PINNED, [A]),
      project(REPEATED, [B, A, B, C, A]),
      project(CLEAN, [A, B]),
      project(UNPINNED)
    ]);
  });

  afterEach(() => {
    sinon.restore();
  });

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  describe('POST /project/{projId}/pin', () => {
    it('stores an id the request repeats once', async () => {
      const { res } = capture();
      await pinsController.protectedAddPins(addArgs(PINNED, [B, C, B]), res);

      expect(await storedPins(PINNED)).to.deep.equal([String(A), String(B), String(C)]);
    });

    it('does not add an id the project already has', async () => {
      const { res, body } = capture();
      await pinsController.protectedAddPins(addArgs(PINNED, [A]), res);

      expect(body.code).to.equal(200);
      expect(await storedPins(PINNED)).to.deep.equal([String(A)]);
    });
  });

  describe('scripts/dedupe-project-pins.js', () => {
    const Project = () => mongoose.model('Project');

    it('finds only the project whose pins repeat an id', async () => {
      const result = await dedupe(Project(), false);

      expect(result.found).to.equal(1);
    });

    it('writes nothing on a dry run', async () => {
      await dedupe(Project(), false);

      expect(await storedPins(REPEATED)).to.have.lengthOf(5);
    });

    it('keeps each id once, in first-seen order, with --apply', async () => {
      const result = await dedupe(Project(), true);

      expect(result.failed).to.deep.equal([]);
      expect(await storedPins(REPEATED)).to.deep.equal([String(B), String(A), String(C)]);
    });

    it('leaves a project with no repeats as it was', async () => {
      await dedupe(Project(), true);

      expect(await storedPins(CLEAN)).to.deep.equal([String(A), String(B)]);
    });

    it('skips a project whose pins changed after the read', async () => {
      const Model = Project();
      const find = Model.find;
      // An admin adds a pin between the script's read and its write.
      sinon.stub(Model, 'find').callsFake((...args) => {
        const query = find.apply(Model, args);
        const lean = query.lean.bind(query);
        query.lean = () => lean().then(async rows => {
          await mongoose.connection.collection('epic').updateOne({ _id: REPEATED }, { $push: { pins: id('58990017d334ee001d60a004') } });
          return rows;
        });
        return query;
      });

      const result = await dedupe(Model, true);

      expect(result.failed).to.deep.equal([String(REPEATED)]);
      expect(await storedPins(REPEATED)).to.have.lengthOf(6);
    });
  });
});
