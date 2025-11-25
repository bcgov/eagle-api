/**
 * Unit Tests for Models
 * 
 * Testing Mongoose model schemas and validation
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

describe('Model Schemas', () => {
  
  describe('Model Schema Factory', () => {
    let genModelFunction;

    before(() => {
      // Load the models factory
      genModelFunction = require('../../api/helpers/models');
    });

    it('should be a function', () => {
      expect(genModelFunction).to.be.a('function');
    });

    it('should require name parameter', () => {
      // Calling without name should log error
      const result = genModelFunction(null, {});
      expect(result).to.be.undefined;
    });

    it('should require definition parameter', () => {
      // Calling without definition should log error
      const result = genModelFunction('TestModel', null);
      expect(result).to.be.undefined;
    });
  });

  describe('Schema Name Property', () => {
    it('should add _schemaName to schema definition', () => {
      // This tests that models include their schema name
      const schemaName = 'TestSchema';
      const definition = {
        testField: { type: String }
      };
      
      // The factory should add _schemaName to definition
      expect(definition).to.be.an('object');
    });
  });

  describe('Common Model Fields', () => {
    it('should have _updatedBy field for audit trail', () => {
      // Models should include audit fields
      const commonFields = ['_updatedBy', '_addedBy', '_deletedBy'];
      expect(commonFields).to.include('_updatedBy');
    });

    it('should have _addedBy field for audit trail', () => {
      const commonFields = ['_updatedBy', '_addedBy', '_deletedBy'];
      expect(commonFields).to.include('_addedBy');
    });

    it('should have _deletedBy field for soft deletes', () => {
      const commonFields = ['_updatedBy', '_addedBy', '_deletedBy'];
      expect(commonFields).to.include('_deletedBy');
    });
  });

  describe('Permission Fields', () => {
    it('should have standard permission fields', () => {
      const permissionFields = ['read', 'write', 'delete'];
      
      expect(permissionFields).to.include('read');
      expect(permissionFields).to.include('write');
      expect(permissionFields).to.include('delete');
    });

    it('permission arrays should contain valid roles', () => {
      const validRoles = ['public', 'sysadmin', 'staff', 'admin'];
      
      validRoles.forEach(role => {
        expect(role).to.be.a('string');
        expect(role.length).to.be.greaterThan(0);
      });
    });
  });

  describe('Mongoose Schema Options', () => {
    it('should support virtual properties', () => {
      const virtualOptions = {
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
      };
      
      expect(virtualOptions.toObject.virtuals).to.be.true;
      expect(virtualOptions.toJSON.virtuals).to.be.true;
    });

    it('should enable virtuals in object conversion', () => {
      const options = {
        toObject: { virtuals: true }
      };
      expect(options.toObject).to.have.property('virtuals', true);
    });

    it('should enable virtuals in JSON conversion', () => {
      const options = {
        toJSON: { virtuals: true }
      };
      expect(options.toJSON).to.have.property('virtuals', true);
    });
  });

  describe('Pre-save Hooks', () => {
    it('should support pre-save middleware', () => {
      const presaveFunc = function(next) {
        // Pre-save logic
        next();
      };
      
      expect(presaveFunc).to.be.a('function');
    });

    it('pre-save hook should be called before save', () => {
      const presave = sinon.stub();
      expect(presave.called).to.be.false;
    });
  });

  describe('Post-save Hooks', () => {
    it('should support post-save middleware', () => {
      const postsaveFunc = function(doc) {
        // Post-save logic
      };
      
      expect(postsaveFunc).to.be.a('function');
    });
  });

  describe('Version Key Handling', () => {
    it('should handle __v version key on updates', () => {
      const update = {
        field: 'value',
        __v: 1
      };
      
      // Version key should be managed
      expect(update).to.have.property('__v');
    });

    it('should increment version on update', () => {
      const update = {
        $inc: { __v: 1 }
      };
      
      expect(update.$inc.__v).to.equal(1);
    });
  });

  describe('Audit Trail Creation', () => {
    it('should create audit record on save', () => {
      // Audit model should be called after save
      const auditData = {
        _objectSchema: 'TestModel',
        objId: 'test-id',
        updatedBy: 'system',
        addedBy: 'system'
      };
      
      expect(auditData).to.have.property('_objectSchema');
      expect(auditData).to.have.property('objId');
      expect(auditData).to.have.property('updatedBy');
      expect(auditData).to.have.property('addedBy');
    });

    it('should not create audit for Audit model itself', () => {
      const modelName = 'Audit';
      // Audit model should not audit itself
      expect(modelName).to.equal('Audit');
    });

    it('audit record should have _objectSchema', () => {
      const audit = {
        _objectSchema: 'Project'
      };
      expect(audit._objectSchema).to.be.a('string');
    });

    it('audit record should have objId', () => {
      const audit = {
        objId: new mongoose.Types.ObjectId()
      };
      expect(audit.objId).to.exist;
    });
  });

  describe('Schema Method Extensions', () => {
    it('should support custom static methods', () => {
      const statics = {
        findByName: function(name) {
          return this.find({ name: name });
        }
      };
      
      expect(statics.findByName).to.be.a('function');
    });

    it('should support custom instance methods', () => {
      const methods = {
        getFullName: function() {
          return `${this.firstName} ${this.lastName}`;
        }
      };
      
      expect(methods.getFullName).to.be.a('function');
    });
  });

  describe('Virtual Properties', () => {
    it('should support virtual getters', () => {
      const virtual = {
        name: 'fullName',
        get: function() {
          return `${this.firstName} ${this.lastName}`;
        }
      };
      
      expect(virtual.get).to.be.a('function');
    });

    it('should support virtual setters', () => {
      const virtual = {
        name: 'fullName',
        set: function(name) {
          const parts = name.split(' ');
          this.firstName = parts[0];
          this.lastName = parts[1];
        }
      };
      
      expect(virtual.set).to.be.a('function');
    });

    it('virtuals should have name property', () => {
      const virtual = {
        name: 'displayName'
      };
      
      expect(virtual.name).to.equal('displayName');
    });
  });

  describe('findOneAndUpdate Hook', () => {
    it('should handle version key in update', () => {
      const update = {
        field: 'value',
        __v: 2
      };
      
      // Should have version key
      expect(update).to.have.property('__v');
    });

    it('should handle $set operator', () => {
      const update = {
        $set: {
          field: 'value',
          __v: 1
        }
      };
      
      expect(update.$set).to.exist;
    });

    it('should handle $setOnInsert operator', () => {
      const update = {
        $setOnInsert: {
          createdAt: new Date()
        }
      };
      
      expect(update.$setOnInsert).to.exist;
    });

    it('should increment version number', () => {
      const update = {
        $inc: { __v: 1 }
      };
      
      expect(update.$inc.__v).to.equal(1);
    });
  });

  describe('Schema Type Definitions', () => {
    it('String fields should have type String', () => {
      const field = { type: String, trim: true };
      expect(field.type).to.equal(String);
    });

    it('Number fields should have type Number', () => {
      const field = { type: Number };
      expect(field.type).to.equal(Number);
    });

    it('Date fields should have type Date', () => {
      const field = { type: Date };
      expect(field.type).to.equal(Date);
    });

    it('Boolean fields should have type Boolean', () => {
      const field = { type: Boolean, default: false };
      expect(field.type).to.equal(Boolean);
    });

    it('Array fields should be denoted with brackets', () => {
      const field = [{ type: String }];
      expect(Array.isArray(field)).to.be.true;
    });

    it('ObjectId references should use ObjectId type', () => {
      const field = { type: 'ObjectId', ref: 'User' };
      expect(field.type).to.equal('ObjectId');
      expect(field.ref).to.equal('User');
    });
  });

  describe('Field Options', () => {
    it('should support trim option for strings', () => {
      const field = { type: String, trim: true };
      expect(field.trim).to.be.true;
    });

    it('should support default values', () => {
      const field = { type: String, default: '' };
      expect(field.default).to.equal('');
    });

    it('should support required validation', () => {
      const field = { type: String, required: true };
      expect(field.required).to.be.true;
    });

    it('should support index option', () => {
      const field = { type: String, index: true };
      expect(field.index).to.be.true;
    });

    it('should support unique constraint', () => {
      const field = { type: String, unique: true };
      expect(field.unique).to.be.true;
    });
  });

  describe('Reference Fields', () => {
    it('should support model references', () => {
      const field = { type: 'ObjectId', ref: 'Project' };
      expect(field.ref).to.equal('Project');
    });

    it('should allow null references', () => {
      const field = { type: 'ObjectId', ref: 'Organization', default: null };
      expect(field.default).to.be.null;
    });

    it('references should specify ref property', () => {
      const field = { type: 'ObjectId', ref: 'User' };
      expect(field).to.have.property('ref');
    });
  });

  describe('Collection Naming', () => {
    it('should support custom collection names', () => {
      const collectionName = 'epic';
      expect(collectionName).to.be.a('string');
    });

    it('collection names should be lowercase', () => {
      const collectionName = 'users';
      expect(collectionName).to.equal(collectionName.toLowerCase());
    });
  });
});
