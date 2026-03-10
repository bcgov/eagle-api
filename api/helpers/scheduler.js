'use strict';

const cron = require('node-cron');
const { updateAllMaterializedViews } = require('../materialized_views/updateViews');

// Default: every 30 minutes (same as legacy CronJob)
const DEFAULT_MATERIALIZED_VIEWS_SCHEDULE = '*/30 * * * *';

let scheduledTask = null;

/**
 * Starts the materialized views update scheduler.
 * 
 * The schedule can be configured via MATERIALIZED_VIEWS_CRON_SCHEDULE environment variable.
 * Uses standard cron syntax: minute hour day-of-month month day-of-week
 * 
 * Default schedule runs every 30 minutes.
 * Set MATERIALIZED_VIEWS_CRON_SCHEDULE to 'disabled' to skip scheduling.
 * 
 * @param {object} logger - Winston logger instance
 * @returns {object|null} - The scheduled task or null if disabled
 */
function startScheduler(logger) {
  const schedule = process.env.MATERIALIZED_VIEWS_CRON_SCHEDULE || DEFAULT_MATERIALIZED_VIEWS_SCHEDULE;
  
  if (schedule.toLowerCase() === 'disabled') {
    logger.info('Materialized views scheduler is disabled');
    return null;
  }

  if (!cron.validate(schedule)) {
    logger.error(`Invalid cron schedule: ${schedule}. Using default: ${DEFAULT_MATERIALIZED_VIEWS_SCHEDULE}`);
    return startWithSchedule(DEFAULT_MATERIALIZED_VIEWS_SCHEDULE, logger);
  }

  return startWithSchedule(schedule, logger);
}

/**
 * Internal function to start the scheduler with a validated schedule.
 * @param {string} schedule - Validated cron schedule string
 * @param {object} logger - Winston logger instance
 * @returns {object} - The scheduled task
 */
function startWithSchedule(schedule, logger) {
  logger.info(`Starting materialized views scheduler with schedule: ${schedule}`);
  
  scheduledTask = cron.schedule(schedule, async () => {
    const startTime = Date.now();
    logger.info('Materialized views update started');
    
    try {
      await updateAllMaterializedViews(logger);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`Materialized views update completed in ${duration}s`);
    } catch (error) {
      logger.error('Materialized views update failed:', error);
    }
  }, {
    scheduled: true,
    timezone: 'America/Vancouver'
  });

  return scheduledTask;
}

/**
 * Stops the scheduler gracefully.
 * @param {object} logger - Winston logger instance
 */
function stopScheduler(logger) {
  if (scheduledTask) {
    logger.info('Stopping materialized views scheduler');
    scheduledTask.stop();
    scheduledTask = null;
  }
}

/**
 * Manually triggers a materialized views update (useful for testing/admin).
 * @param {object} logger - Winston logger instance
 */
async function triggerUpdate(logger) {
  logger.info('Manual materialized views update triggered');
  await updateAllMaterializedViews(logger);
}

module.exports = {
  startScheduler,
  stopScheduler,
  triggerUpdate
};
