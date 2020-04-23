const topSearchTerms = require('./reports/topSearchTerms');
const changesPerformedByNonPublicUsers = require('./reports/changesPerformedByNonPublicUsers');
const changesPerformedByNonPublicUsersLast14 = require('./reports/changesPerformedOverLast14Days');

/**
 * This function is called by a cron and is used to update all material view collections.
 * When a new report is created, add the functions to check the date and update the values here.
 */
exports.updateAllMaterializedViews = async function(defaultLog) {
  let afterTimestamp;

  afterTimestamp = await topSearchTerms.get_last(defaultLog);
  await topSearchTerms.update(defaultLog, afterTimestamp);

  afterTimestamp = await changesPerformedByNonPublicUsers.get_last(defaultLog);
  await changesPerformedByNonPublicUsers.update(defaultLog, afterTimestamp);


  // These reports do not check for a last timestamp as they are generated over a set time period.
  await changesPerformedByNonPublicUsersLast14.update(defaultLog);
};
