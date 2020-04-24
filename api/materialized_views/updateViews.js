const topSearchTerms = require('./reports/topSearchTerms');
const changesPerformedByNonPublicUsers = require('./reports/changesPerformedByNonPublicUsers');
const changesPerformedByNonPublicUsersLast14 = require('./reports/changesPerformedOverLast14Days');
const projectsWithCompletelyTaggedDocs = require('./reports/projectsWithCompletelyTaggedDocs');
const documentTaggingProgressBarGraph = require('./reports/documentTaggingProgressBarGraph');
const documentTaggingProgressByProject = require('./reports/documentTaggingProgressByProject');
const documentTaggingProgressTotal = require('./reports/documentTaggingProgressTotal');
const projectGeoInfo = require('./reports/projectGeoInfo');
const projectStatsFull = require('./reports/projectStatsFull');
const publishedComments = require('./reports/publishedComments');
const publishedNewItems = require('./reports/publishedNewItems');

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

  afterTimestamp = await publishedNewItems.get_last(defaultLog);
  await publishedNewItems.update(defaultLog, afterTimestamp);


  /**
   * These reports do not check for a last timestamp as they are generated over a set time
   * period or have a query that cannot be tracked with timestamps.
   */
  await changesPerformedByNonPublicUsersLast14.update(defaultLog);
  await projectsWithCompletelyTaggedDocs.update(defaultLog);
  await documentTaggingProgressBarGraph.update(defaultLog);
  await documentTaggingProgressByProject.update(defaultLog);
  await documentTaggingProgressTotal.update(defaultLog);
  await projectGeoInfo.update(defaultLog);
  await projectStatsFull.update(defaultLog);
  await publishedComments.update(defaultLog);
};
