const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

describe('Model Schemas', () => {

  // Without the paths, strict mode would drop the $set that flags a row for demi-push-sweep.
  describe('DEMI pending-push fields', () => {
    before(() => {
      require('../../api/helpers/models/project');
      require('../../api/helpers/models/user');
      require('../../api/helpers/models/list');
      require('../../api/helpers/models/audit');
    });

    ['Project', 'User'].forEach(name => {
      it(`${name} declares demiPushPending, demiPushFailedAt and demiPushError`, () => {
        const schema = mongoose.model(name).schema;

        expect(schema.path('demiPushPending').instance).to.equal('Boolean');
        expect(schema.path('demiPushFailedAt').instance).to.equal('Date');
        expect(schema.path('demiPushError').instance).to.equal('String');
      });
    });

    ['List', 'Audit'].forEach(name => {
      it(`${name}, which is never pushed, has no pending-push fields`, () => {
        expect(mongoose.model(name).schema.path('demiPushPending')).to.be.undefined;
      });
    });
  });

  // Only demiPush may write the three fields, so a client body passed straight to a write cannot clear or forge them.
  describe('DEMI pending-push fields in an update from outside demiPush', () => {
    const OID = '5f4c7d1e2b3a4c5d6e7f8091';
    let Project;

    before(() => {
      Project = mongoose.model('Project');
    });

    afterEach(() => sinon.restore());

    // The query's own write step is stubbed, so its hooks run with no database behind it.
    const updateAfterHooks = async (query, writeStep) => {
      sinon.stub(query, writeStep).resolves({});
      await query.exec();
      return query.getUpdate();
    };

    it('drops them from the top level and from every operator of an updateOne', async () => {
      const update = await updateAfterHooks(Project.updateOne({ _id: OID }, {
        name: 'a', demiPushPending: false, $set: { demiPushError: null, description: 'b' }, $unset: { demiPushFailedAt: '' }
      }), '_updateOne');

      expect(update).to.deep.equal({ name: 'a', $set: { description: 'b' } });
    });

    it('drops them from a findOneAndUpdate body', async () => {
      const update = await updateAfterHooks(Project.findOneAndUpdate({ _id: OID }, { name: 'a', demiPushPending: false }), '_findOneAndUpdate');

      expect(update).to.include({ name: 'a' }).and.not.have.property('demiPushPending');
    });

    it('drops them from an updateMany', async () => {
      const update = await updateAfterHooks(Project.updateMany({}, { $set: { demiPushPending: true, name: 'a' } }), '_updateMany');

      expect(update).to.deep.equal({ $set: { name: 'a' } });
    });

    it('keeps them in an update passing demiPushInternal', async () => {
      const update = await updateAfterHooks(
        Project.updateOne({ _id: OID }, { $unset: { demiPushPending: '' } }, { demiPushInternal: true }), '_updateOne'
      );

      expect(update).to.deep.equal({ $unset: { demiPushPending: '' } });
    });
  });

  describe('Common Model Fields', () => {
    let TestModel;

    before(() => {
      const genModelFunction = require('../../api/helpers/models');
      // Use a unique name to avoid mongoose model re-registration errors
      const modelName = 'TestAuditFields_' + Date.now();
      TestModel = genModelFunction(modelName, { testField: { type: String } }, 'test_collection');
    });

    it('should have _updatedBy field compiled into the schema', () => {
      expect(TestModel.schema.paths).to.have.property('_updatedBy');
    });

    it('should have _addedBy field compiled into the schema', () => {
      expect(TestModel.schema.paths).to.have.property('_addedBy');
    });

    it('should have _deletedBy field compiled into the schema', () => {
      expect(TestModel.schema.paths).to.have.property('_deletedBy');
    });
  });
});
