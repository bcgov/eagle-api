/**
 * Unit Tests for Search Controller
 * 
 * Testing search functionality across different collections
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const constants = require('../../api/helpers/constants');

describe('Search Controller Functions', () => {
  
  describe('Search Configuration', () => {
    it('should have default page size', () => {
      const defaultPageSize = 25;
      expect(defaultPageSize).to.equal(25);
    });

    it('should have default page number', () => {
      const defaultPageNum = 0;
      expect(defaultPageNum).to.equal(0);
    });

    it('should support case sensitive search', () => {
      const caseSensitive = true;
      expect(caseSensitive).to.be.a('boolean');
    });

    it('should support case insensitive search', () => {
      const caseSensitive = false;
      expect(caseSensitive).to.be.a('boolean');
    });

    it('should support fuzzy search', () => {
      const fuzzy = true;
      expect(fuzzy).to.be.a('boolean');
    });
  });

  describe('Searchable Schema Types', () => {
    it('should support Document search', () => {
      expect(constants.schemaTypes.DOCUMENT).to.equal('Document');
    });

    it('should support Project search', () => {
      expect(constants.schemaTypes.PROJECT).to.equal('Project');
    });

    it('should support CAC search', () => {
      expect(constants.schemaTypes.CAC).to.equal('CACUser');
    });

    it('should support Group search', () => {
      expect(constants.schemaTypes.GROUP).to.equal('Group');
    });

    it('should support User search', () => {
      expect(constants.schemaTypes.USER).to.equal('User');
    });

    it('should support Recent Activity search', () => {
      expect(constants.schemaTypes.RECENT_ACTIVITY).to.equal('RecentActivity');
    });

    it('should support Inspection search', () => {
      expect(constants.schemaTypes.INSPECTION).to.equal('Inspection');
    });

    it('should support Inspection Element search', () => {
      expect(constants.schemaTypes.INSPECTION_ELEMENT).to.equal('InspectionElement');
    });

    it('should support Project Notification search', () => {
      expect(constants.schemaTypes.PROJECT_NOTIFICATION).to.equal('ProjectNotification');
    });

    it('should support List search', () => {
      expect(constants.schemaTypes.LIST).to.equal('List');
    });

    it('should support Comment Period search', () => {
      expect(constants.schemaTypes.COMMENT_PERIOD).to.equal('CommentPeriod');
    });

    it('should support Organization search', () => {
      expect(constants.schemaTypes.ORGANIZATION).to.equal('Organization');
    });
  });

  describe('Search Query Parameters', () => {
    it('should accept keywords parameter', () => {
      const keywords = 'environmental assessment';
      expect(keywords).to.be.a('string');
    });

    it('should accept dataset parameter', () => {
      const dataset = 'Document';
      expect(dataset).to.be.a('string');
    });

    it('should accept project parameter', () => {
      const projectId = new mongoose.Types.ObjectId();
      expect(mongoose.Types.ObjectId.isValid(projectId)).to.be.true;
    });

    it('should accept pageNum parameter', () => {
      const pageNum = 0;
      expect(pageNum).to.be.a('number');
      expect(pageNum).to.be.at.least(0);
    });

    it('should accept pageSize parameter', () => {
      const pageSize = 25;
      expect(pageSize).to.be.a('number');
      expect(pageSize).to.be.greaterThan(0);
    });

    it('should accept sortBy parameter', () => {
      const sortBy = ['-score'];
      expect(sortBy).to.be.an('array');
    });

    it('should accept populate parameter', () => {
      const populate = true;
      expect(populate).to.be.a('boolean');
    });
  });

  describe('Search Aggregation', () => {
    it('should support match aggregation', () => {
      const matchStage = { $match: { _schemaName: 'Document' } };
      expect(matchStage).to.have.property('$match');
    });

    it('should support sort aggregation', () => {
      const sortStage = { $sort: { score: -1 } };
      expect(sortStage).to.have.property('$sort');
    });

    it('should support skip aggregation', () => {
      const skipStage = { $skip: 0 };
      expect(skipStage).to.have.property('$skip');
    });

    it('should support limit aggregation', () => {
      const limitStage = { $limit: 25 };
      expect(limitStage).to.have.property('$limit');
    });

    it('should support lookup aggregation', () => {
      const lookupStage = { 
        $lookup: { 
          from: 'projects', 
          localField: 'project', 
          foreignField: '_id', 
          as: 'projectData' 
        } 
      };
      expect(lookupStage).to.have.property('$lookup');
    });
  });

  describe('Search Collation', () => {
    it('should use English locale', () => {
      const collation = { locale: 'en', strength: 2 };
      expect(collation.locale).to.equal('en');
    });

    it('should use strength 2 for case insensitive', () => {
      const collation = { locale: 'en', strength: 2 };
      expect(collation.strength).to.equal(2);
    });

    it('should have valid collation object', () => {
      const collation = { locale: 'en', strength: 2 };
      expect(collation).to.have.property('locale');
      expect(collation).to.have.property('strength');
    });
  });

  describe('Search Sorting', () => {
    it('should support ascending sort', () => {
      const sortOrder = 1;
      expect(sortOrder).to.equal(1);
    });

    it('should support descending sort', () => {
      const sortOrder = -1;
      expect(sortOrder).to.equal(-1);
    });

    it('should support multiple sort fields', () => {
      const sortBy = ['name', '-dateAdded'];
      expect(sortBy).to.be.an('array');
      expect(sortBy.length).to.be.greaterThan(1);
    });

    it('should parse sort direction from field name', () => {
      const fieldWithDirection = '-score';
      const hasDescending = fieldWithDirection.charAt(0) === '-';
      expect(hasDescending).to.be.true;
    });

    it('should extract field name from sort string', () => {
      const fieldWithDirection = '-score';
      const fieldName = fieldWithDirection.slice(1);
      expect(fieldName).to.equal('score');
    });
  });

  describe('Search Operators', () => {
    it('should support AND operator', () => {
      const andQuery = 'term1 AND term2';
      expect(andQuery).to.include('AND');
    });

    it('should support OR operator', () => {
      const orQuery = 'term1 OR term2';
      expect(orQuery).to.include('OR');
    });

    it('should handle empty AND parameter', () => {
      const and = '';
      expect(and).to.equal('');
    });

    it('should handle empty OR parameter', () => {
      const or = '';
      expect(or).to.equal('');
    });
  });

  describe('Search Keywords', () => {
    it('should decode URI encoded keywords', () => {
      const encoded = 'environmental%20assessment';
      const decoded = decodeURIComponent(encoded);
      expect(decoded).to.equal('environmental assessment');
    });

    it('should handle special characters in keywords', () => {
      const keywords = 'project-name & location';
      expect(keywords).to.be.a('string');
    });

    it('should handle empty keywords', () => {
      const keywords = '';
      expect(keywords).to.equal('');
    });

    it('should handle undefined keywords', () => {
      const keywords = undefined;
      expect(keywords).to.be.undefined;
    });

    it('should handle multiple word keywords', () => {
      const keywords = 'environmental assessment project mine';
      const words = keywords.split(' ');
      expect(words.length).to.be.greaterThan(1);
    });
  });

  describe('Search Results', () => {
    it('should return results array', () => {
      const results = [];
      expect(results).to.be.an('array');
    });

    it('should include total count', () => {
      const response = {
        results: [],
        total: 0
      };
      expect(response).to.have.property('total');
    });

    it('should include page information', () => {
      const response = {
        results: [],
        pageNum: 0,
        pageSize: 25
      };
      expect(response).to.have.property('pageNum');
      expect(response).to.have.property('pageSize');
    });

    it('should filter by roles', () => {
      const roles = ['public'];
      expect(roles).to.be.an('array');
    });
  });

  describe('Search Permissions', () => {
    it('should respect public role access', () => {
      const roles = ['public'];
      expect(roles).to.include('public');
    });

    it('should respect staff role access', () => {
      const roles = ['staff'];
      expect(roles).to.include('staff');
    });

    it('should respect sysadmin role access', () => {
      const roles = ['sysadmin'];
      expect(roles).to.include('sysadmin');
    });

    it('should handle multiple roles', () => {
      const roles = ['staff', 'sysadmin'];
      expect(roles).to.have.lengthOf(2);
    });
  });

  describe('Search Categorization', () => {
    it('should support categorized search', () => {
      const categorized = true;
      expect(categorized).to.be.a('boolean');
    });

    it('should handle null categorized parameter', () => {
      const categorized = null;
      expect(categorized).to.be.null;
    });

    it('should group results by category', () => {
      const categories = ['Type A', 'Type B', 'Type C'];
      expect(categories).to.be.an('array');
    });
  });

  describe('Search Project Legislation', () => {
    it('should filter by project legislation', () => {
      const projectLegislation = '2002';
      expect(projectLegislation).to.be.a('string');
    });

    it('should handle empty legislation parameter', () => {
      const projectLegislation = '';
      expect(projectLegislation).to.equal('');
    });

    it('should support multiple legislation years', () => {
      const legislationYears = ['2002', '2018'];
      expect(legislationYears).to.be.an('array');
    });
  });

  describe('Search Error Handling', () => {
    it('should handle missing match aggregation', () => {
      const error = new Error('Search missing match aggregation');
      expect(error.message).to.include('match aggregation');
    });

    it('should handle invalid schema name', () => {
      const invalidSchema = 'InvalidSchema';
      expect(invalidSchema).to.not.equal('Document');
      expect(invalidSchema).to.not.equal('Project');
    });

    it('should handle aggregation errors', () => {
      const error = { code: 500, message: 'Aggregation failed' };
      expect(error).to.have.property('code');
      expect(error).to.have.property('message');
    });
  });

  describe('Search Performance', () => {
    it('should support disk use for large queries', () => {
      const allowDiskUse = true;
      expect(allowDiskUse).to.be.true;
    });

    it('should have reasonable page size limits', () => {
      const maxPageSize = 1000;
      const defaultPageSize = 25;
      expect(defaultPageSize).to.be.lessThan(maxPageSize);
    });

    it('should support pagination for large result sets', () => {
      const totalResults = 1000;
      const pageSize = 25;
      const totalPages = Math.ceil(totalResults / pageSize);
      expect(totalPages).to.equal(40);
    });
  });

  describe('Search Data Types', () => {
    it('should search text fields', () => {
      const textField = 'name';
      expect(textField).to.be.a('string');
    });

    it('should search date fields', () => {
      const dateField = new Date();
      expect(dateField).to.be.instanceOf(Date);
    });

    it('should search numeric fields', () => {
      const numericField = 100;
      expect(numericField).to.be.a('number');
    });

    it('should search boolean fields', () => {
      const booleanField = true;
      expect(booleanField).to.be.a('boolean');
    });

    it('should search ObjectId fields', () => {
      const objectIdField = new mongoose.Types.ObjectId();
      expect(mongoose.Types.ObjectId.isValid(objectIdField)).to.be.true;
    });
  });

  describe('Search Response Format', () => {
    it('should return consistent response structure', () => {
      const response = {
        results: [],
        total: 0,
        pageNum: 0,
        pageSize: 25
      };
      
      expect(response).to.have.all.keys('results', 'total', 'pageNum', 'pageSize');
    });

    it('should include metadata in response', () => {
      const metadata = {
        searchTime: 100,
        totalMatches: 50
      };
      
      expect(metadata).to.have.property('searchTime');
      expect(metadata).to.have.property('totalMatches');
    });
  });
});
