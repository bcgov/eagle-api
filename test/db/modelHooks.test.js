// Hooks every model gets from api/helpers/models.js, against a real MongoDB (yarn db:up, yarn test:db).

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');
require('../../api/helpers/models/list');
require('../../api/helpers/models/audit');
const { TEST_URI, id } = require('./parentReadFixtures');

const LIST = id('58990017d334ee001d60c001');

describe('model factory hooks (requires MongoDB)', function () {
  this.timeout(30000);

  let List;
  let Audit;

  before(async () => {
    await mongoose.connect(TEST_URI);
    List = mongoose.model('List');
    Audit = mongoose.model('Audit');
  });

  beforeEach(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('audit').deleteMany({});
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('audit').deleteMany({});
    await mongoose.disconnect();
  });

  it('findOneAndUpdate bumps the stored version by one, whatever version the client sent', async () => {
    await mongoose.connection.collection('epic').insertOne({ _id: LIST, _schemaName: 'List', name: 'old', __v: 3 });

    await List.findOneAndUpdate({ _id: LIST }, { __v: 0, $set: { name: 'renamed', __v: 0 } });

    const stored = await mongoose.connection.collection('epic').findOne({ _id: LIST });
    expect(stored).to.include({ name: 'renamed', __v: 4 });
  });

  it('save writes an Audit row naming the saved document and who added and updated it', async () => {
    // The hook does not await its Audit save; the spy only hands the test that promise to wait on.
    const auditSave = sinon.spy(Audit.prototype, 'save');

    await new List({ _id: LIST, name: 'n', _addedBy: 'alice', _updatedBy: 'bob' }).save();
    await Promise.all(auditSave.returnValues);

    const row = await mongoose.connection.collection('audit').findOne({ objId: LIST });
    expect(row).to.include({ _objectSchema: 'List', addedBy: 'alice', updatedBy: 'bob' });
  });
});
