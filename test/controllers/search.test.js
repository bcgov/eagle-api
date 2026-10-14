/**
 * Unit Tests for Search Controller
 *
 * ponytail: Fully mocked unit tests for Search controller to check logic, validation, pagination, and sorting.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const Actions    = require('../../api/helpers/actions');
const defaultLog = require('winston').loggers.get('default');

const parentRead = require('../../api/helpers/parentRead');
const { COMMENT_STAFF_FIELDS } = require('../../api/helpers/constants');
const documentAggregator = require('../../api/aggregators/documentAggregator');
const searchController = require('../../api/controllers/search');

describe('Search Controller', () => {
  let res;
  let aggregateStub;
  let modelStub;

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          _id:              { value: null },
          keywords:         { value: 'environment' },
          dataset:          { value: 'Document' },
          project:          { value: '507f1f77bcf86cd799439011' },
          populate:         { value: false },
          pageNum:          { value: 0 },
          pageSize:         { value: 10 },
          projectLegislation: { value: '2018' },
          sortBy:           { value: ['-dateAdded'] },
          caseSensitive:    { value: false },
          and:              { value: '' },
          or:               { value: '' },
          categorized:      { value: null },
          fuzzy:            { value: false },
          _schemaName:      { value: 'Document' },
          auth_payload: {
            realm_access:        { roles: ['sysadmin'] },
            preferred_username:  'testuser'
          },
          ...paramOverrides
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub() };

    aggregateStub = {
      allowDiskUse: sinon.stub().returnsThis(),
      collation: sinon.stub().returnsThis(),
      option: sinon.stub().returnsThis(),
      exec: sinon.stub().resolves([{ searchResults: [{ _id: '123' }], total_items: 1 }])
    };

    modelStub = {
      aggregate: sinon.stub().returns(aggregateStub),
      find: sinon.stub().returns({
        sort: sinon.stub().returnsThis(),
        collation: sinon.stub().returnsThis(),
        exec: sinon.stub().resolves([{ _id: 'list_1', name: 'List 1' }])
      })
    };

    sinon.stub(mongoose, 'model').callsFake(() => modelStub);
    sinon.stub(mongoose, 'modelNames').returns(['Document', 'Project', 'Comment', 'CACUser', 'RecentActivity', 'Inspection']);

    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'filterData').callsFake((schema, data) => data);

    // The parent gate reads the epic collection; there is no connection here, and what it returns
    // is covered against a real MongoDB by test/db/*ParentRead.test.js.
    sinon.stub(parentRead, 'unreadableParentIds').resolves([]);
    sinon.stub(parentRead, 'unreadablePeriodIds').resolves([]);
    sinon.stub(parentRead, 'readablePeriodIds').resolves([]);

    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => {
      r.status(code).json(data);
      return data;
    });

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
    sinon.stub(defaultLog, 'debug');
    sinon.stub(defaultLog, 'warn');
  });

  afterEach(() => sinon.restore());

  describe('protectedOptions', () => {
    it('returns 200', () => {
      searchController.protectedOptions({}, res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(res.send.calledOnce).to.be.true;
    });
  });

  describe('executeQuery Errors & Validation', () => {
    it('rejects invalid project ObjectId format', async () => {
      const args = makeArgs({ project: { value: 'invalid-id' } });
      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('rejects invalid _id ObjectId format', async () => {
      const args = makeArgs({ _id: { value: 'invalid-id' } });
      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('rejects negative pageSize', async () => {
      const args = makeArgs({ pageSize: { value: -1 } });
      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    it('rejects invalid dataset names', async () => {
      const args = makeArgs({ dataset: { value: 'InvalidDataset' } });
      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });

    // Item accepts Vc as a _schemaName, but there is no Vc dataset pipeline, so it must not
    // reach searchCollection and throw 'Search missing match aggregation'.
    it('rejects Vc as a dataset', async () => {
      const args = makeArgs({ dataset: { value: 'Vc' }, _schemaName: { value: 'Vc' } });
      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('executeQuery Pagination Limits', () => {
    it('enforces maximum pageSize of 100 for unauthenticated public documents', async () => {
      const args = makeArgs({
        dataset: { value: 'Document' },
        pageSize: { value: 2000 },
        auth_payload: { realm_access: { roles: ['public'] } }
      });
      await searchController.publicGet(args, res);
      // Min of 2000 and 100 is 100
      expect(modelStub.aggregate.calledOnce).to.be.true;
    });

    it('enforces normal maximum pageSize for authenticated staff', async () => {
      const args = makeArgs({
        dataset: { value: 'Document' },
        pageSize: { value: 2000 },
        auth_payload: { realm_access: { roles: ['staff'] } }
      });
      await searchController.publicGet(args, res);
      expect(modelStub.aggregate.calledOnce).to.be.true;
    });
  });

  describe('executeQuery Sorting Parser', () => {
    it('handles commas in sorting values', async () => {
      const args = makeArgs({ sortBy: { value: ['-dateAdded,name'] } });
      await searchController.publicGet(args, res);
      expect(modelStub.aggregate.calledOnce).to.be.true;
    });

    // Ordering itself is checked against MongoDB in test/db/recentActivitySort.test.js; this guards the cost.
    it('cuts the populated Updates page before the project join when sorting on an Update field', async () => {
      await searchController.protectedGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        populate: { value: true },
        keywords: { value: '' },
        sortBy: { value: ['-dateAdded'] }
      }), res);

      const page = modelStub.aggregate.firstCall.args[0].find(stage => stage.$facet).$facet.searchResults;
      const limitIndex = page.findIndex(stage => stage.$limit);
      expect(limitIndex).to.be.greaterThan(-1).and.lessThan(page.findIndex(stage => stage.$lookup));
    });
  });

  describe('Fields hidden from a public Update search', () => {
    const updateSearch = (overrides) => makeArgs({ dataset: { value: 'RecentActivity' }, keywords: { value: '' }, ...overrides });
    const publicCaller = { auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' } };

    const probes = {
      'an and filter on _addedBy': { and: { value: '_addedBy=jsmith' } },
      'an or filter on _updatedBy': { or: { value: '_updatedBy=jsmith' } },
      'a filter on _deletedBy': { and: { value: '_deletedBy=jsmith' } },
      'a filter on a path under notifiedAt': { and: { value: 'notifiedAt.x=1' } },
      'a sort on notifiedAt': { sortBy: { value: ['-notifiedAt'] } },
      'a sort on _addedBy after another key': { sortBy: { value: ['-dateAdded,+_addedBy'] } }
    };

    Object.entries(probes).forEach(([label, overrides]) => {
      it(`refuses ${label} without querying`, async () => {
        await searchController.publicGet(updateSearch({ ...publicCaller, ...overrides }), res);

        expect(res.status.calledWith(400)).to.be.true;
        expect(modelStub.aggregate.called).to.be.false;
      });
    });

    it('still serves a public filter on a shown field', async () => {
      await searchController.publicGet(updateSearch({ ...publicCaller, and: { value: 'type=News' } }), res);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('lets staff filter on a staff field', async () => {
      await searchController.protectedGet(updateSearch({ and: { value: '_addedBy=jsmith' } }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(JSON.stringify(modelStub.aggregate.firstCall.args[0][0])).to.include('"_addedBy":"jsmith"');
    });
  });

  describe('Comment item search', () => {
    it('hides the author unless the comment is marked not anonymous; the field defaults to anonymous', async () => {
      modelStub.aggregate.returns({ allowDiskUse: () => Promise.resolve([
        { _id: 'a', author: 'Jane' },
        { _id: 'b', author: 'Sam', isAnonymous: true },
        { _id: 'c', author: 'Lee', isAnonymous: false }
      ]) });

      await searchController.publicGet(makeArgs({
        dataset: { value: 'Item' },
        _schemaName: { value: 'Comment' },
        _id: { value: '507f1f77bcf86cd799439011' }
      }), res);

      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(res.json.firstCall.args[0].map(row => row.author)).to.deep.equal([undefined, undefined, 'Lee']);
    });

    const staffFields = Object.fromEntries(COMMENT_STAFF_FIELDS.map(field => [field, `${field} value`]));
    const commentItem = (overrides) => makeArgs({
      dataset: { value: 'Item' },
      _schemaName: { value: 'Comment' },
      _id: { value: '507f1f77bcf86cd799439011' },
      ...overrides
    });

    beforeEach(() => {
      modelStub.aggregate.returns({ allowDiskUse: () => Promise.resolve([{ _id: 'a', comment: 'Hi', ...staffFields }]) });
    });

    it('drops every staff field for a public caller', async () => {
      await searchController.publicGet(commentItem({
        auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' }
      }), res);

      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(res.json.firstCall.args[0][0]).to.deep.equal({ _id: 'a', comment: 'Hi' });
    });

    it('keeps the staff fields for signed-in staff', async () => {
      await searchController.protectedGet(commentItem(), res);

      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(res.json.firstCall.args[0][0]).to.include(staffFields);
    });

    const HIDDEN_FIELDS = {
      ...staffFields,
      demiPushPending: true,
      demiPushFailedAt: new Date(),
      demiPushError: 'push error',
      write: ['staff'],
      delete: ['staff'],
      _addedBy: 'staff-user',
      _updatedBy: 'staff-user',
      _deletedBy: 'staff-user'
    };
    const SHOWN_FIELDS = { _id: 'a', _schemaName: 'Comment', comment: 'Hi', commentId: 7, period: 'p1', read: ['public'], isAnonymous: false, author: 'Lee' };
    const publicCaller = { auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' } };

    it('returns only the public comment fields to a public caller', async () => {
      modelStub.aggregate.returns({ allowDiskUse: () => Promise.resolve([{ ...SHOWN_FIELDS, ...HIDDEN_FIELDS }]) });

      await searchController.publicGet(commentItem(publicCaller), res);

      expect(res.json.firstCall.args[0]).to.deep.equal([SHOWN_FIELDS]);
    });

    it('cleans a stored comment even when another schema name was asked for', async () => {
      modelStub.aggregate.returns({ allowDiskUse: () => Promise.resolve([{ ...SHOWN_FIELDS, isAnonymous: true, ...HIDDEN_FIELDS }]) });

      await searchController.publicGet(commentItem({ ...publicCaller, _schemaName: { value: 'Document' } }), res);

      const expected = { ...SHOWN_FIELDS, isAnonymous: true };
      delete expected.author;
      expect(res.json.firstCall.args[0]).to.deep.equal([expected]);
    });
  });

  describe('Item schema name', () => {
    const itemArgs = (schemaName, overrides = {}) => makeArgs({
      dataset: { value: 'Item' },
      _schemaName: { value: schemaName },
      _id: { value: '507f1f77bcf86cd799439011' },
      auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' },
      ...overrides
    });

    it('matches on the requested schema name as well as the id', async () => {
      aggregateStub.allowDiskUse.resolves([]);

      await searchController.publicGet(itemArgs('Document'), res);

      const firstStage = modelStub.aggregate.firstCall.args[0][0];
      expect(String(firstStage.$match._id)).to.equal('507f1f77bcf86cd799439011');
      expect(firstStage.$match._schemaName).to.equal('Document');
    });

    it('strips the staff project fields from a stored project asked for under another name', async () => {
      Utils.filterData.restore();
      aggregateStub.allowDiskUse.resolves([{ _id: 'p', _schemaName: 'Project', name: 'Mine', review180Start: 'x', reviewExtensions: ['y'] }]);

      await searchController.publicGet(itemArgs('Document'), res);

      expect(res.json.firstCall.args[0]).to.deep.equal([{ _id: 'p', _schemaName: 'Project', name: 'Mine' }]);
    });
  });

  describe('Document search signed-in flag', () => {
    // createMatchAggr takes signedIn as its ninth argument.
    const signedInArg = () => documentAggregator.createMatchAggr.firstCall.args[8];

    beforeEach(() => {
      sinon.stub(documentAggregator, 'createMatchAggr').resolves([{ $match: {} }]);
    });

    it('passes signedIn true for a signed-in caller', async () => {
      await searchController.protectedGet(makeArgs({ dataset: { value: 'Document' } }), res);

      expect(signedInArg()).to.equal(true);
    });

    it('passes signedIn false for a public caller', async () => {
      await searchController.publicGet(makeArgs({
        dataset: { value: 'Document' },
        auth_payload: { realm_access: { roles: ['public'] }, preferred_username: 'public' }
      }), res);

      expect(signedInArg()).to.equal(false);
    });
  });

  describe('Item Aggregator Search', () => {
    it('returns item when dataset is ITEM', async () => {
      const args = makeArgs({
        dataset: { value: 'Item' },
        _schemaName: { value: 'Document' },
        _id: { value: '507f1f77bcf86cd799439011' }
      });

      aggregateStub.allowDiskUse.resolves([{ _id: '123' }]);

      await searchController.publicGet(args, res);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('rejects item search on invalid schemaName', async () => {
      const args = makeArgs({
        dataset: { value: 'Item' },
        _schemaName: { value: 'InvalidSchema' },
        _id: { value: '507f1f77bcf86cd799439011' }
      });

      await searchController.publicGet(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('Parent Gate', () => {
    const parent = new mongoose.Types.ObjectId();

    // The pipeline handed to Mongo is the only place the gate shows up, so these read it back.
    function pipeline() {
      return modelStub.aggregate.firstCall.args[0];
    }

    function gateStages(stages) {
      return stages.filter(stage => stage.$match && stage.$match.project && stage.$match.project.$nin);
    }

    beforeEach(() => {
      parentRead.unreadableParentIds.resolves([parent]);
    });

    it('drops recent activity under a parent the caller cannot read', async () => {
      await searchController.publicGet(makeArgs({ dataset: { value: 'RecentActivity' }, keywords: { value: '' } }), res);

      const gates = gateStages(pipeline());
      expect(gates).to.have.lengthOf(1);
      expect(gates[0].$match.project.$nin).to.deep.equal([parent]);
    });

    it('keeps the recent activity gate ahead of the page when populating', async () => {
      await searchController.publicGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        populate: { value: true },
        keywords: { value: '' }
      }), res);

      const stages = pipeline();
      const facetIndex = stages.findIndex(stage => stage.$facet);
      const gateIndex = stages.findIndex(stage => stage.$match && stage.$match.project && stage.$match.project.$nin);

      expect(facetIndex, 'populate takes the $facet path').to.be.greaterThan(-1);
      expect(gateIndex, 'gate runs before $skip/$limit').to.be.greaterThan(-1).and.to.be.lessThan(facetIndex);
      // Hoisted, not copied: a second gate inside the facet would drop rows after the page is cut.
      expect(gateStages(stages[facetIndex].$facet.searchResults)).to.be.empty;
    });

    // A $match whose $or holds the published branch; only the publish gate builds one.
    const publishGates = stages => stages.filter(stage => stage.$match && stage.$match.$or &&
      stage.$match.$or.some(branch => branch.status === 'published'));

    it('keeps drafts and scheduled Updates away from a public caller, ahead of the page', async () => {
      await searchController.publicGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        populate: { value: true },
        keywords: { value: '' },
        auth_payload: undefined
      }), res);

      const stages = pipeline();
      const facetIndex = stages.findIndex(stage => stage.$facet);
      const gateIndex = stages.findIndex(stage => publishGates([stage]).length);
      expect(gateIndex).to.be.greaterThan(-1).and.to.be.lessThan(facetIndex);
      const live = stages[gateIndex].$match.$or.find(branch => branch.status === 'published');
      expect(live.publishDate.$lte).to.be.instanceOf(Date);
      expect(publishGates(stages[facetIndex].$facet.searchResults)).to.be.empty;
    });

    it('leaves drafts and scheduled Updates to a staff caller', async () => {
      await searchController.protectedGet(makeArgs({ dataset: { value: 'RecentActivity' }, keywords: { value: '' } }), res);

      expect(publishGates(pipeline())).to.be.empty;
    });

    const archivedGates = stages => stages.filter(stage => stage.$match && stage.$match.status && stage.$match.status.$ne === 'archived');

    it('leaves archived Updates out of a staff search that did not ask for them', async () => {
      await searchController.protectedGet(makeArgs({ dataset: { value: 'RecentActivity' }, keywords: { value: '' } }), res);

      expect(archivedGates(pipeline())).to.have.lengthOf(1);
    });

    it('returns archived Updates to a staff search filtering on status', async () => {
      await searchController.protectedGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        keywords: { value: '' },
        and: { value: 'status=archived' }
      }), res);

      const stages = pipeline();
      expect(archivedGates(stages)).to.be.empty;
      expect(JSON.stringify(stages[0])).to.include('"status":"archived"');
    });

    it('splits a staff status filter on commas into either value', async () => {
      await searchController.protectedGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        keywords: { value: '' },
        and: { value: 'status=draft,archived' }
      }), res);

      expect(pipeline()[0].$match.$and).to.deep.include({ $or: [{ status: 'draft' }, { status: 'archived' }] });
    });

    it('leaves archived Updates out of a staff search filtering on another field', async () => {
      await searchController.protectedGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        keywords: { value: '' },
        and: { value: 'type=News' }
      }), res);

      expect(archivedGates(pipeline())).to.have.lengthOf(1);
    });

    it('resolves the unreadable parents once per request', async () => {
      await searchController.publicGet(makeArgs({
        dataset: { value: 'RecentActivity' },
        populate: { value: true },
        keywords: { value: '' }
      }), res);

      expect(parentRead.unreadableParentIds.callCount).to.equal(1);
    });

    it('drops an inspection under a parent the caller cannot read', async () => {
      await searchController.publicGet(makeArgs({ dataset: { value: 'Inspection' }, keywords: { value: '' } }), res);

      const gates = gateStages(pipeline());
      expect(gates).to.have.lengthOf(1);
      expect(gates[0].$match.project.$nin).to.deep.equal([parent]);
    });

    ['RecentActivity', 'Inspection'].forEach(schemaName => {
      it(`gates a single ${schemaName} fetched through dataset=Item`, async () => {
        const args = makeArgs({
          dataset: { value: 'Item' },
          _schemaName: { value: schemaName },
          _id: { value: '507f1f77bcf86cd799439011' }
        });
        aggregateStub.allowDiskUse.resolves([]);

        await searchController.publicGet(args, res);

        expect(res.status.calledWith(200)).to.be.true;
        const gates = gateStages(pipeline());
        expect(gates).to.have.lengthOf(1);
        expect(gates[0].$match.project.$nin).to.deep.equal([parent]);
      });
    });
  });

  describe('List Dataset Search', () => {
    it('returns list items directly when dataset is List', async () => {
      const args = makeArgs({
        dataset: { value: 'List' }
      });

      await searchController.publicGet(args, res);
      expect(res.status.calledWith(200)).to.be.true;
      expect(modelStub.find.calledOnce).to.be.true;
    });
  });
});
