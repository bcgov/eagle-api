// What Mongo answers when a create reuses a key, which Utils.isDuplicateKey turns into a 409.
// Run with: yarn db:up && yarn test:db

'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const { TEST_URI, id } = require('./parentReadFixtures');

const ORG = id('58990017d334ee001d60ff01');
const PROJECTS = [id('58990017d334ee001d60ff02'), id('58990017d334ee001d60ff03')];
const TRACK_ID = 990017;

const createError = (Model, row) => Model.create(row).then(() => null, err => err);

describe('Create with a sent _id (MongoDB)', () => {
  const Organization = () => mongoose.model('Organization');
  const Project = () => mongoose.model('Project');
  const cleanUp = () => mongoose.connection.collection('epic').deleteMany({ _id: { $in: [ORG, ...PROJECTS] } });

  before(async () => {
    await mongoose.connect(TEST_URI);
    await Project().createIndexes();
    await cleanUp();
  });

  after(async () => {
    await cleanUp();
    await mongoose.disconnect();
  });

  it('reads a second create with the same _id as a duplicate id', async () => {
    expect(await createError(Organization(), { _id: ORG, name: 'First' })).to.equal(null);
    const err = await createError(Organization(), { _id: ORG, name: 'Second' });

    expect(Utils.isDuplicateKey(err)).to.equal(true);
    expect(await Organization().countDocuments({ _id: ORG })).to.equal(1);
  });

  it('does not read a duplicate on another unique key as a duplicate id', async () => {
    expect(await createError(Project(), { _id: PROJECTS[0], trackProjectId: TRACK_ID })).to.equal(null);
    const err = await createError(Project(), { _id: PROJECTS[1], trackProjectId: TRACK_ID });

    expect(err && err.code).to.equal(11000);
    expect(Utils.isDuplicateKey(err)).to.equal(false);
  });
});
