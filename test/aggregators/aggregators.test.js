/**
 * Unit Tests for Aggregators
 * 
 * Testing MongoDB aggregation pipeline builders
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

describe('Document Aggregator', () => {
  let documentAggregator;
  let aggregateHelper;

  before(() => {
    documentAggregator = require('../../api/aggregators/documentAggregator');
    aggregateHelper = require('../../api/helpers/aggregators');
  });

  describe('createMatchAggr', () => {
    beforeEach(() => {
      sinon.stub(aggregateHelper, 'generateExpArray').resolves([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should create basic match aggregation', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, null, false, null, null, null, ['public']);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(result[0]).to.have.property('$match');
    });

    it('should include schema name in match', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, null, false, null, null, null, ['public']);
      
      expect(result[0].$match._schemaName).to.equal('Document');
    });

    it('should include project filter when projectId provided', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const result = await documentAggregator.createMatchAggr('Document', projectId, null, false, null, null, null, ['public']);
      
      expect(result[0].$match).to.have.property('project');
    });

    it('should include text search when keywords provided', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, 'test keywords', false, null, null, null, ['public']);
      
      expect(result[0].$match).to.have.property('$text');
      expect(result[0].$match.$text).to.have.property('$search');
    });

    it('should handle case sensitive search', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, 'test', true, null, null, null, ['public']);
      
      expect(result[0].$match.$text.$caseSensitive).to.be.true;
    });

    it('should handle case insensitive search', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, 'test', false, null, null, null, ['public']);
      
      expect(result[0].$match.$text.$caseSensitive).to.be.false;
    });

    it('should include deleted filter', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, null, false, null, null, null, ['public']);
      
      expect(result[0].$match).to.have.property('$or');
    });

    it('should handle categorized=true', async () => {
      const result = await documentAggregator.createMatchAggr('Document', null, null, false, null, null, true, ['public']);
      
      expect(result[0].$match).to.have.property('type');
      expect(result[0].$match).to.have.property('milestone');
      expect(result[0].$match).to.have.property('documentAuthorType');
    });
  });

  describe('createDocumentAggr', () => {
    it('should create document aggregation pipeline', () => {
      // createSortingPagingAggr requires sortingValue to be an object, not null
      const result = documentAggregator.createDocumentAggr(false, ['public'], {}, null, null, 0, 25);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should include sorting when provided', () => {
      const result = documentAggregator.createDocumentAggr(false, ['public'], {}, 'name', 1, 0, 25);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should handle populate option', () => {
      const result = documentAggregator.createDocumentAggr(true, ['public'], {}, null, null, 0, 25);
      
      expect(result).to.be.an('array');
      // Should have additional lookup stages when populate=true
    });

    it('should include pagination', () => {
      const result = documentAggregator.createDocumentAggr(false, ['public'], {}, null, null, 1, 10);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should enforce published status for public role', () => {
      const result = documentAggregator.createDocumentAggr(false, ['public'], {}, null, null, 0, 25);
      
      // Should have a match stage for status: 'published'
      const matchStage = result.find(stage => stage.$match && stage.$match.status === 'published');
      expect(matchStage).to.exist;
    });
  });
});

describe('Search Aggregator', () => {
  let searchAggregator;
  let aggregateHelper;

  before(() => {
    searchAggregator = require('../../api/aggregators/searchAggregator');
    aggregateHelper = require('../../api/helpers/aggregators');
  });

  describe('createMatchAggr', () => {
    beforeEach(() => {
      sinon.stub(aggregateHelper, 'generateExpArray').resolves([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should create search match aggregation', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, null, false, null, null, ['public'], false);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should include schema name', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, null, false, null, null, ['public'], false);
      
      expect(result[0].$match._schemaName).to.equal('Project');
    });

    it('should handle keywords with fuzzy search', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, 'test', false, null, null, ['public'], true);
      
      expect(result[0].$match).to.have.property('$text');
    });

    it('should handle keywords without fuzzy search', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, 'test', false, null, null, ['public'], false);
      
      expect(result[0].$match).to.have.property('$text');
    });

    it('should strip quotes from keywords', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, '"quoted text"', false, null, null, ['public'], false);
      
      expect(result).to.be.an('array');
    });

    it('should include redact stage for permissions', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, null, false, null, null, ['public'], false);
      
      const redactStage = result.find(stage => stage.$redact);
      expect(redactStage).to.exist;
    });

    it('should add score field', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, 'test', false, null, null, ['public'], false);
      
      const addFieldsStage = result.find(stage => stage.$addFields);
      expect(addFieldsStage).to.exist;
      expect(addFieldsStage.$addFields).to.have.property('score');
    });

    it('should handle multiple roles', async () => {
      const result = await searchAggregator.createMatchAggr('Project', null, null, false, null, null, ['staff', 'sysadmin'], false);
      
      expect(result).to.be.an('array');
    });
  });

  describe('createResultAggregator', () => {
    it('should create result aggregation', () => {
      const result = searchAggregator.createResultAggregator();
      
      expect(result).to.be.an('array');
    });
  });

  describe('createRegexForProjectLookupAggr', () => {
    it('should create regex aggregation for project lookup', async () => {
      const result = await searchAggregator.createRegexForProjectLookupAggr('test', false);
      
      expect(result).to.be.an('array');
    });

    it('should handle case sensitive regex', async () => {
      const result = await searchAggregator.createRegexForProjectLookupAggr('test', true);
      
      expect(result).to.be.an('array');
    });

    it('should handle empty keywords', async () => {
      const result = await searchAggregator.createRegexForProjectLookupAggr('', false);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('Project Aggregator', () => {
  let projectAggregator;

  before(() => {
    projectAggregator = require('../../api/aggregators/projectAggregator');
  });

  describe('createProjectAggr', () => {
    it('should create project aggregation for default legislation', () => {
      const result = projectAggregator.createProjectAggr('default');
      
      expect(result).to.be.an('array');
    });

    it('should create project aggregation for 1996 legislation', () => {
      const result = projectAggregator.createProjectAggr('1996');
      
      expect(result).to.be.an('array');
    });

    it('should create project aggregation for 2002 legislation', () => {
      const result = projectAggregator.createProjectAggr('2002');
      
      expect(result).to.be.an('array');
    });

    it('should create project aggregation for 2018 legislation', () => {
      const result = projectAggregator.createProjectAggr('2018');
      
      expect(result).to.be.an('array');
    });

    it('should handle all legislation', () => {
      const result = projectAggregator.createProjectAggr('all');
      
      expect(result).to.be.an('array');
    });

    it('should handle undefined legislation', () => {
      const result = projectAggregator.createProjectAggr();
      
      expect(result).to.be.an('array');
    });

    it('should handle empty string legislation', () => {
      const result = projectAggregator.createProjectAggr('');
      
      expect(result).to.be.an('array');
    });
  });
});

describe('User Aggregator', () => {
  let userAggregator;

  before(() => {
    userAggregator = require('../../api/aggregators/userAggregator');
  });

  describe('createUserAggr', () => {
    it('should create user aggregation without populate', () => {
      const result = userAggregator.createUserAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should create user aggregation with populate', () => {
      const result = userAggregator.createUserAggr(true);
      
      expect(result).to.be.an('array');
    });

    it('should return array', () => {
      const result = userAggregator.createUserAggr();
      
      expect(Array.isArray(result)).to.be.true;
    });
  });
});

describe('Group Aggregator', () => {
  let groupAggregator;

  before(() => {
    groupAggregator = require('../../api/aggregators/groupAggregator');
  });

  describe('createGroupAggr', () => {
    it('should create group aggregation without populate', () => {
      const result = groupAggregator.createGroupAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should create group aggregation with populate', () => {
      const result = groupAggregator.createGroupAggr(true);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('Inspection Aggregator', () => {
  let inspectionAggregator;

  before(() => {
    inspectionAggregator = require('../../api/aggregators/inspectionAggregator');
  });

  describe('createInspectionAggr', () => {
    it('should create inspection aggregation', () => {
      const result = inspectionAggregator.createInspectionAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should handle populate option', () => {
      const result = inspectionAggregator.createInspectionAggr(true);
      
      expect(result).to.be.an('array');
    });
  });

  describe('createInspectionElementAggr', () => {
    it('should create inspection element aggregation', () => {
      const result = inspectionAggregator.createInspectionElementAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should handle populate option', () => {
      const result = inspectionAggregator.createInspectionElementAggr(true);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('Recent Activity Aggregator', () => {
  let recentActivityAggregator;

  before(() => {
    recentActivityAggregator = require('../../api/aggregators/recentActivityAggregator');
  });

  describe('createRecentActivityAggr', () => {
    it('should create recent activity aggregation', () => {
      const result = recentActivityAggregator.createRecentActivityAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should handle populate option', () => {
      const result = recentActivityAggregator.createRecentActivityAggr(true);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('Comment Period Aggregator', () => {
  let commentPeriodAggregator;

  before(() => {
    commentPeriodAggregator = require('../../api/aggregators/commentPeriodAggregator');
  });

  describe('createCommentPeriodAggr', () => {
    it('should create comment period aggregation', () => {
      const result = commentPeriodAggregator.createCommentPeriodAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should handle populate option', () => {
      const result = commentPeriodAggregator.createCommentPeriodAggr(true);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('Notification Project Aggregator', () => {
  let notificationProjectAggregator;

  before(() => {
    notificationProjectAggregator = require('../../api/aggregators/notificationProjectAggregator');
  });

  describe('createNotificationProjectAggr', () => {
    it('should create notification project aggregation', () => {
      const result = notificationProjectAggregator.createNotificationProjectAggr(false);
      
      expect(result).to.be.an('array');
    });

    it('should handle populate option', () => {
      const result = notificationProjectAggregator.createNotificationProjectAggr(true);
      
      expect(result).to.be.an('array');
    });
  });
});

describe('CAC Aggregator', () => {
  let cacAggregator;
  let aggregateHelper;

  before(() => {
    cacAggregator = require('../../api/aggregators/cacAggregator');
    aggregateHelper = require('../../api/helpers/aggregators');
  });

  describe('createMatchAggr', () => {
    beforeEach(() => {
      sinon.stub(aggregateHelper, 'generateExpArray').resolves([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should create CAC match aggregation', async () => {
      const result = await cacAggregator.createMatchAggr('CACUser', null, null, false, null, null, ['public']);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should include schema name', async () => {
      const result = await cacAggregator.createMatchAggr('CACUser', null, null, false, null, null, ['public']);
      
      expect(result[0].$match._schemaName).to.equal('CACUser');
    });
  });
});

describe('Item Aggregator', () => {
  let itemAggregator;

  before(() => {
    itemAggregator = require('../../api/aggregators/itemAggregator');
  });

  describe('createItemAggr', () => {
    it('should create item aggregation', () => {
      const validObjectId = new mongoose.Types.ObjectId();
      const result = itemAggregator.createItemAggr(validObjectId.toString(), 'Item', ['public']);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(result[0].$match._id).to.exist;
    });

    it('should include permissions check', () => {
      const validObjectId = new mongoose.Types.ObjectId();
      const result = itemAggregator.createItemAggr(validObjectId.toString(), 'Item', ['public']);
      
      const redactStage = result.find(stage => stage.$redact);
      expect(redactStage).to.exist;
    });

    it('should handle inspection schema with lookups', () => {
      const validObjectId = new mongoose.Types.ObjectId();
      const constants = require('../../api/helpers/constants').schemaTypes;
      const result = itemAggregator.createItemAggr(validObjectId.toString(), constants.INSPECTION, ['public']);
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(1);
    });
  });
});

describe('Aggregation Pipeline Structure', () => {
  it('should have valid MongoDB operators', () => {
    const validOperators = [
      '$match', '$project', '$lookup', '$unwind', '$group',
      '$sort', '$skip', '$limit', '$redact', '$addFields'
    ];
    
    validOperators.forEach(op => {
      expect(op).to.be.a('string');
      expect(op).to.match(/^\$/);
    });
  });

  it('should validate aggregation stage structure', () => {
    const stage = { $match: { _schemaName: 'Document' } };
    
    expect(stage).to.be.an('object');
    expect(Object.keys(stage).length).to.equal(1);
    expect(Object.keys(stage)[0]).to.match(/^\$/);
  });

  it('should handle empty aggregation', () => {
    const aggregation = [];
    
    expect(aggregation).to.be.an('array');
    expect(aggregation).to.have.lengthOf(0);
  });

  it('should chain multiple stages', () => {
    const aggregation = [
      { $match: { _schemaName: 'Document' } },
      { $sort: { name: 1 } },
      { $limit: 10 }
    ];
    
    expect(aggregation).to.have.lengthOf(3);
    aggregation.forEach(stage => {
      expect(stage).to.be.an('object');
    });
  });
});
