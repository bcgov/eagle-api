/**
 * Unit Tests for API Helpers - Utils
 * 
 * Testing utility functions used throughout the API
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const utils = require('../../api/helpers/utils');

describe('Utils Helper Functions', () => {
  
  describe('buildQuery', () => {
    it('should build query with single valid ObjectId', () => {
      const validId = new mongoose.Types.ObjectId();
      const query = {};
      const result = utils.buildQuery('projectId', validId.toString(), query);
      
      expect(result).to.have.property('projectId');
      expect(result.projectId).to.have.property('$in');
      expect(result.projectId.$in).to.be.an('array');
      expect(result.projectId.$in).to.have.lengthOf(1);
    });

    it('should build query with array of valid ObjectIds', () => {
      const id1 = new mongoose.Types.ObjectId();
      const id2 = new mongoose.Types.ObjectId();
      const query = {};
      const result = utils.buildQuery('projectId', [id1.toString(), id2.toString()], query);
      
      expect(result.projectId.$in).to.have.lengthOf(2);
    });

    it('should ignore invalid ObjectId strings', () => {
      const query = {};
      const result = utils.buildQuery('projectId', 'invalid-id', query);
      
      expect(result.projectId.$in).to.have.lengthOf(0);
    });

    it('should filter out invalid ObjectIds from array', () => {
      const validId = new mongoose.Types.ObjectId();
      const query = {};
      const result = utils.buildQuery('projectId', [validId.toString(), 'not-valid'], query);
      
      // Only valid ObjectIds should be in the result
      expect(result.projectId.$in.length).to.be.greaterThan(0);
      expect(result.projectId.$in[0].toString()).to.equal(validId.toString());
    });

    it('should preserve existing query properties', () => {
      const validId = new mongoose.Types.ObjectId();
      const query = { existingProp: 'value' };
      const result = utils.buildQuery('projectId', validId.toString(), query);
      
      expect(result).to.have.property('existingProp', 'value');
      expect(result).to.have.property('projectId');
    });
  });

  describe('getBasePath', () => {
    it('should construct base path with http protocol', () => {
      const result = utils.getBasePath('http', 'example.com');
      expect(result).to.equal('http://example.com');
    });

    it('should construct base path with https protocol', () => {
      const result = utils.getBasePath('https', 'api.example.com');
      expect(result).to.equal('https://api.example.com');
    });

    it('should handle localhost', () => {
      const result = utils.getBasePath('http', 'localhost:3000');
      expect(result).to.equal('http://localhost:3000');
    });
  });

  describe('getSkipLimitParameters', () => {
    it('should return default limit when no parameters provided', () => {
      const params = utils.getSkipLimitParameters();
      expect(params).to.be.an('object');
      expect(params).to.not.have.property('skip');
      expect(params).to.not.have.property('limit');
    });

    it('should calculate skip and limit for page 0', () => {
      const pageSize = { value: 10 };
      const pageNum = { value: 0 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params.skip).to.equal(0);
      expect(params.limit).to.equal(10);
    });

    it('should calculate skip and limit for page 1', () => {
      const pageSize = { value: 10 };
      const pageNum = { value: 1 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params.skip).to.equal(10);
      expect(params.limit).to.equal(10);
    });

    it('should calculate skip and limit for page 5 with pageSize 20', () => {
      const pageSize = { value: 20 };
      const pageNum = { value: 5 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params.skip).to.equal(100);
      expect(params.limit).to.equal(20);
    });

    it('should use default page size when pageSize is 0', () => {
      const pageSize = { value: 0 };
      const pageNum = { value: 0 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params.limit).to.equal(100); // DEFAULT_PAGESIZE
    });

    it('should handle negative pageSize by using default', () => {
      const pageSize = { value: -10 };
      const pageNum = { value: 0 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params.limit).to.equal(100); // DEFAULT_PAGESIZE
    });

    it('should ignore negative page numbers', () => {
      const pageSize = { value: 10 };
      const pageNum = { value: -1 };
      const params = utils.getSkipLimitParameters(pageSize, pageNum);
      
      expect(params).to.not.have.property('skip');
      expect(params).to.not.have.property('limit');
    });
  });

  describe('recordAction', () => {
    let auditSaveStub;
    let AuditModel;

    beforeEach(() => {
      // Create a mock Audit model
      AuditModel = function(data) {
        this.data = data;
        this.save = auditSaveStub;
      };
      
      auditSaveStub = sinon.stub().resolves({ _id: 'saved-audit-id' });
      sinon.stub(mongoose, 'model').returns(AuditModel);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should create audit record with required fields', async () => {
      const action = 'create';
      const meta = { resource: 'project' };
      const payload = { userId: '123' };
      
      await utils.recordAction(action, meta, payload);
      
      expect(auditSaveStub.calledOnce).to.be.true;
    });

    it('should create audit record with optional objId', async () => {
      const action = 'update';
      const meta = { resource: 'document' };
      const payload = { userId: '456' };
      const objId = 'obj-123';
      
      await utils.recordAction(action, meta, payload, objId);
      
      expect(auditSaveStub.calledOnce).to.be.true;
    });

    it('should handle null objId parameter', async () => {
      const action = 'delete';
      const meta = { resource: 'comment' };
      const payload = { userId: '789' };
      
      await utils.recordAction(action, meta, payload, null);
      
      expect(auditSaveStub.calledOnce).to.be.true;
    });
  });

  describe('avScan', () => {
    // Note: avScan tests would require mocking the clamav module
    // These are placeholder tests showing the structure
    
    it('should be a function', () => {
      expect(utils.avScan).to.be.a('function');
    });

    it('should return a promise', () => {
      const buffer = Buffer.from('test');
      const result = utils.avScan(buffer);
      expect(result).to.be.instanceOf(Promise);
    });
  });

  describe('runDataQuery', () => {
    it('should be a function', () => {
      expect(utils.runDataQuery).to.be.a('function');
    });

    it('should return a promise', () => {
      const result = utils.runDataQuery('Project', [], {}, [], null, null, 0, 10, false, []);
      expect(result).to.be.instanceOf(Promise);
    });
  });
});
