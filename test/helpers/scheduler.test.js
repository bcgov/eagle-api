'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

describe('Scheduler', function() {
  let scheduler;
  let mockLogger;
  let originalEnv;
  
  beforeEach(function() {
    // Save original env
    originalEnv = process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE;
    delete process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE;
    
    // Create mock logger
    mockLogger = {
      info: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub()
    };
    
    // Clear module cache to get fresh instance
    delete require.cache[require.resolve('../../api/helpers/scheduler')];
  });
  
  afterEach(function() {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE = originalEnv;
    } else {
      delete process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE;
    }
    
    sinon.restore();
  });
  
  describe('startScheduler', function() {
    it('should use default schedule when no env var set', function() {
      scheduler = require('../../api/helpers/scheduler');
      const result = scheduler.startScheduler(mockLogger);
      
      // Should log with default schedule
      expect(mockLogger.info.called).to.be.true;
      const logMessage = mockLogger.info.getCall(0).args[0];
      expect(logMessage).to.include('*/30 * * * *');
    });
    
    it('should use custom schedule from env var', function() {
      process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE = '0 * * * *';
      
      // Re-require to pick up new env
      delete require.cache[require.resolve('../../api/helpers/scheduler')];
      scheduler = require('../../api/helpers/scheduler');
      
      const result = scheduler.startScheduler(mockLogger);
      
      expect(mockLogger.info.called).to.be.true;
      const logMessage = mockLogger.info.getCall(0).args[0];
      expect(logMessage).to.include('0 * * * *');
    });
    
    it('should return null when disabled', function() {
      process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE = 'disabled';
      
      delete require.cache[require.resolve('../../api/helpers/scheduler')];
      scheduler = require('../../api/helpers/scheduler');
      
      const result = scheduler.startScheduler(mockLogger);
      
      expect(result).to.be.null;
      expect(mockLogger.info.calledWith('Materialized views scheduler is disabled')).to.be.true;
    });
    
    it('should handle case-insensitive disabled value', function() {
      process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE = 'DISABLED';
      
      delete require.cache[require.resolve('../../api/helpers/scheduler')];
      scheduler = require('../../api/helpers/scheduler');
      
      const result = scheduler.startScheduler(mockLogger);
      
      expect(result).to.be.null;
    });
  });
  
  describe('stopScheduler', function() {
    it('should log when stopping scheduler', function() {
      scheduler = require('../../api/helpers/scheduler');
      
      // Start first
      scheduler.startScheduler(mockLogger);
      
      // Then stop
      scheduler.stopScheduler(mockLogger);
      
      expect(mockLogger.info.calledWith('Stopping materialized views scheduler')).to.be.true;
    });
    
    it('should not error when no scheduler running', function() {
      scheduler = require('../../api/helpers/scheduler');
      
      // Should not throw
      expect(() => scheduler.stopScheduler(mockLogger)).to.not.throw();
    });
  });
  
  describe('triggerUpdate', function() {
    it('should be a function', function() {
      scheduler = require('../../api/helpers/scheduler');
      expect(scheduler.triggerUpdate).to.be.a('function');
    });
    
    it('should log when triggered', async function() {
      scheduler = require('../../api/helpers/scheduler');
      
      // This will actually try to run the update, which will fail without MongoDB
      // But we can verify the log was called
      try {
        await scheduler.triggerUpdate(mockLogger);
      } catch (e) {
        // Expected to fail without MongoDB connection
      }
      
      expect(mockLogger.info.calledWith('Manual materialized views update triggered')).to.be.true;
    });
  });
});
