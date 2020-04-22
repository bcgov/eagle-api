const topSearchTerms = require('./reports/topSearchTerms');

/**
 * This function is called by a cron and is used to update all material view collections.
 * When a new report is created, add the functions to check the date and update the values here.
 */
exports.updateAllMaterializedViews = async function(defaultLog) {
  let afterTimestamp = await topSearchTerms.get_last(defaultLog);
  await topSearchTerms.update(defaultLog, afterTimestamp);
};
