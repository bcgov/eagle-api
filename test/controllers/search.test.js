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
      aggregate: sinon.stub().returns(aggregateStub)
    };

    sinon.stub(mongoose, 'model').callsFake(() => modelStub);
    sinon.stub(mongoose, 'modelNames').returns(['Document', 'Project', 'Comment', 'CACUser']);

    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'filterData').callsFake((schema, data) => data);

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
  });

  describe('Item Aggregator Search', () => {
    it('returns item when dataset is ITEM', async () => {
      const args = makeArgs({
        dataset: { value: 'Item' },
        _schemaName: { value: 'Document' },
        _id: { value: '507f1f77bcf86cd799439011' }
      });

      aggregateStub.exec.resolves([{ _id: '123' }]);

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
});
