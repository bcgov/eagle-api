const topSearchTerms = require('./reports/topSearchTerms');
const changesPerformedByNonPublicUsers = require('./reports/changesPerformedByNonPublicUsers');
const changesPerformedByNonPublicUsersLast14 = require('./reports/changesPerformedOverLast14Days');
const projectsWithCompletelyTaggedDocs = require('./reports/projectsWithCompletelyTaggedDocs');
const documentTaggingProgressBarGraph = require('./reports/documentTaggingProgressBarGraph');
const documentTaggingProgressByProject = require('./reports/documentTaggingProgressByProject');
const documentTaggingProgressTotal = require('./reports/documentTaggingProgressTotal');
const projectInfo = require('./reports/projectInfo');
const projectStatsFull = require('./reports/projectStatsFull');
const publishedComments = require('./reports/publishedComments');
const publishedNewItems = require('./reports/publishedNewItems');
const topUserVisitsAllTime = require('./reports/topUserVisitsAllTime');
const topUserVisitsLast14 = require('./reports/topUserVisitsLast14');
const unpublishedComments = require('./reports/unpublishedComments');
const whoPublishedUnpublishedAllUsers = require('./reports/whoPublishedUnpublishedAllUsers');
const organizations = require('./reports/organizations');
const contactDetails = require('./reports/contactDetails');

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

  afterTimestamp = await topUserVisitsAllTime.get_last(defaultLog);
  await topUserVisitsAllTime.update(defaultLog, afterTimestamp);

  /**
   * These reports do not check for a last timestamp as they are generated over a set time
   * period or have a query that cannot be tracked with timestamps.
   */
  await changesPerformedByNonPublicUsersLast14.update(defaultLog);
  await projectsWithCompletelyTaggedDocs.update(defaultLog);
  await documentTaggingProgressBarGraph.update(defaultLog);
  await documentTaggingProgressByProject.update(defaultLog);
  await documentTaggingProgressTotal.update(defaultLog);
  await projectInfo.update(defaultLog);
  await projectStatsFull.update(defaultLog);
  await publishedComments.update(defaultLog);
  await topUserVisitsLast14.update(defaultLog);
  await unpublishedComments.update(defaultLog);
  await whoPublishedUnpublishedAllUsers.update(defaultLog);
  await organizations.update(defaultLog);
  await contactDetails.update(defaultLog);
};
