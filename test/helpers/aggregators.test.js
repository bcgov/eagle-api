const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const aggregatorsHelper = require('../../api/helpers/aggregators');

describe('Aggregators Helper Functions', function() {
  


  describe('setProjectDefault', function() {
    it('should create $switch aggregation for all 3 legislation years', function() {
      const result = aggregatorsHelper.setProjectDefault(true);
      const branches = result[0].$addFields.default.$switch.branches;
      
      expect(branches).to.have.lengthOf(3);
      expect(branches.find(b => b.then === '$legislation_1996')).to.exist;
      expect(branches.find(b => b.then === '$legislation_2002')).to.exist;
      expect(branches.find(b => b.then === '$legislation_2018')).to.exist;
      expect(result[0].$addFields.default.$switch.default).to.equal('$legislation_2002');
    });

    it('should nest under project when projectOnly=false', function() {
      const result = aggregatorsHelper.setProjectDefault(false);
      expect(result[0].$addFields).to.have.property('project.default');
    });
  });

  describe('isEmpty', function() {
    it('should correctly identify empty values', function() {
      expect(aggregatorsHelper.isEmpty(null)).to.be.true;
      expect(aggregatorsHelper.isEmpty(undefined)).to.be.true;
      expect(aggregatorsHelper.isEmpty('')).to.be.true;
      expect(aggregatorsHelper.isEmpty([])).to.be.true;
      expect(aggregatorsHelper.isEmpty({})).to.be.true;
      expect(aggregatorsHelper.isEmpty(0)).to.be.true;
      expect(aggregatorsHelper.isEmpty(false)).to.be.true;
    });

    it('should correctly identify non-empty values', function() {
      expect(aggregatorsHelper.isEmpty('test')).to.be.false;
      expect(aggregatorsHelper.isEmpty([1])).to.be.false;
      expect(aggregatorsHelper.isEmpty({ key: 'val' })).to.be.false;
    });
  });

  describe('createSortingPagingAggr', function() {
    it('should create faceted aggregation with sort, skip, and limit', function() {
      const result = aggregatorsHelper.createSortingPagingAggr('Project', { name: 1 }, 'name', 1, 2, 10);
      const facetStage = result.find(stage => stage.$facet);
      
      expect(facetStage.$facet).to.have.property('searchResults');
      expect(facetStage.$facet).to.have.property('meta');
      
      const sortStage = facetStage.$facet.searchResults.find(stage => stage.$sort);
      const skipStage = facetStage.$facet.searchResults.find(stage => stage.$skip !== undefined);
      const limitStage = facetStage.$facet.searchResults.find(stage => stage.$limit);
      
      expect(sortStage.$sort.name).to.equal(1);
      expect(skipStage.$skip).to.equal(20);
      expect(limitStage.$limit).to.equal(10);
    });

    it('should handle Document schema with additional transformations', function() {
      const result = aggregatorsHelper.createSortingPagingAggr('Document', { displayName: 1 }, 'displayName', 1, 0, 10);
      
      expect(result.find(stage => stage.$addFields)).to.exist;
      expect(result.find(stage => stage.$unwind)).to.exist;
      expect(result.find(stage => stage.$replaceRoot)).to.exist;
    });
  });

  describe('generateExpArray', function() {
    it('should return empty array when query string is empty', async function() {
      const result = await aggregatorsHelper.generateExpArray('', {}, 'Project');
      expect(result).to.have.lengthOf(0);
    });

    it('should parse query parameters into MongoDB expressions', async function() {
      const result = await aggregatorsHelper.generateExpArray('name=Test&status=Active', {}, 'Project');
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('unwindProjectData', function() {
    it('should create aggregation with $addFields for project data', function() {
      const result = aggregatorsHelper.unwindProjectData('legislationData', 'legislationDataId', null);
      const addFieldsStage = result.find(stage => stage.$addFields);
      
      expect(addFieldsStage.$addFields).to.have.property('legislationData.read');
      expect(addFieldsStage.$addFields).to.have.property('legislationData.pins');
    });
  });

  describe('addProjectLookupAggrs', function() {
    it('should create $lookup and $unwind stages for project relations', function() {
      const result = aggregatorsHelper.addProjectLookupAggrs(null, 'projectData');
      
      expect(result.filter(stage => stage.$lookup).length).to.be.greaterThan(0);
      expect(result.filter(stage => stage.$unwind).length).to.be.greaterThan(0);
    });

    it('should preserve existing aggregation stages', function() {
      const existingAggr = [{ $match: { _id: '123' } }];
      const result = aggregatorsHelper.addProjectLookupAggrs(existingAggr, 'projectData');
      
      expect(result[0].$match._id).to.equal('123');
      expect(result.length).to.be.greaterThan(1);
    });
  });
});
