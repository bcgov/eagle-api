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
const topUserVisitsAllTime = require('./reports/topUserVisitsAllTime');
const topUserVisitsLast14 = require('./reports/topUserVisitsLast14');
const unpublishedComments = require('./reports/unpublishedComments');
const whoPublishedUnpublishedAllUsers = require('./reports/whoPublishedUnpublishedAllUsers');
const organizations = require('./reports/organizations');
const contactDetails = require('./reports/contactDetails');
const { acquireLock, releaseLock } = require('./runLock');

// Pause between view updates to reduce peak DB load.
// Override with MAT_VIEW_STAGGER_MS env var.
const STAGGER_MS = parseInt(process.env.MAT_VIEW_STAGGER_MS || '2000', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a single materialized view update with timing and error isolation.
 * Returns true on success, false on failure. Never throws.
 */
async function runView(name, fn, defaultLog) {
  const start = Date.now();
  defaultLog.info(`[mat-view] starting: ${name}`);
  try {
    await fn();
    defaultLog.info(`[mat-view] completed: ${name} (${Date.now() - start}ms)`);
    return true;
  } catch (err) {
    defaultLog.error(`[mat-view] FAILED: ${name} after ${Date.now() - start}ms — ${err.message}`);
    return false;
  }
}

/**
 * Run an array of { name, fn } view descriptors sequentially.
 * Acquires a named run-lock before starting; releases in finally.
 * Inserts a stagger delay between each view.
 */
async function runViews(views, lockId, defaultLog) {
  if (!await acquireLock(lockId, defaultLog)) return;

  const totalStart = Date.now();
  const succeeded = [];
  const failed = [];

  try {
    for (let i = 0; i < views.length; i++) {
      const { name, fn } = views[i];
      const ok = await runView(name, fn, defaultLog);
      (ok ? succeeded : failed).push(name);
      if (i < views.length - 1) await sleep(STAGGER_MS);
    }
  } finally {
    const durationMs = Date.now() - totalStart;
    await releaseLock(lockId, defaultLog, { durationMs, succeeded, failed });
    const summary = `[mat-view] '${lockId}' done in ${durationMs}ms — ok:[${succeeded.join(',')}]` +
      (failed.length ? ` FAILED:[${failed.join(',')}]` : '');
    defaultLog.info(summary);
  }
}

/**
 * Hot views — user-facing dashboard data. Run frequently (every 15-30 min).
 */
function buildHotViews(defaultLog) {
  return [
    { name: 'projectInfo',             fn: () => projectInfo.update(defaultLog) },
    { name: 'projectStatsFull',        fn: () => projectStatsFull.update(defaultLog) },
    { name: 'organizations',           fn: () => organizations.update(defaultLog) },
    { name: 'contactDetails',          fn: () => contactDetails.update(defaultLog) },
  ];
}

/**
 * Cold views — admin reports. Run off-peak (nightly).
 */
function buildColdViews(defaultLog) {
  // Helper for views that use a watermark timestamp
  function tsView(name, mod) {
    return {
      name,
      fn: async () => {
        const ts = await mod.get_last(defaultLog);
        await mod.update(defaultLog, ts);
      },
    };
  }

  return [
    tsView('topSearchTerms',                   topSearchTerms),
    tsView('changesPerformedByNonPublicUsers',  changesPerformedByNonPublicUsers),
    tsView('topUserVisitsAllTime',              topUserVisitsAllTime),
    { name: 'changesPerformedOverLast14Days',   fn: () => changesPerformedByNonPublicUsersLast14.update(defaultLog) },
    { name: 'projectsWithCompletelyTaggedDocs', fn: () => projectsWithCompletelyTaggedDocs.update(defaultLog) },
    { name: 'documentTaggingProgressBarGraph',  fn: () => documentTaggingProgressBarGraph.update(defaultLog) },
    { name: 'documentTaggingProgressByProject', fn: () => documentTaggingProgressByProject.update(defaultLog) },
    { name: 'documentTaggingProgressTotal',     fn: () => documentTaggingProgressTotal.update(defaultLog) },
    { name: 'publishedComments',                fn: () => publishedComments.update(defaultLog) },
    { name: 'topUserVisitsLast14',              fn: () => topUserVisitsLast14.update(defaultLog) },
    { name: 'unpublishedComments',              fn: () => unpublishedComments.update(defaultLog) },
    { name: 'whoPublishedUnpublishedAllUsers',  fn: () => whoPublishedUnpublishedAllUsers.update(defaultLog) },
  ];
}

/**
 * Update only hot (user-facing) views. Intended for frequent cron schedule.
 */
exports.updateHotViews = function(defaultLog) {
  return runViews(buildHotViews(defaultLog), 'mat_view_hot', defaultLog);
};

/**
 * Update only cold (admin report) views. Intended for nightly off-peak cron.
 */
exports.updateColdViews = function(defaultLog) {
  return runViews(buildColdViews(defaultLog), 'mat_view_cold', defaultLog);
};

/**
 * Update all views in one pass. Kept for backwards compatibility with
 * existing 'default' subset callers.
 */
exports.updateAllMaterializedViews = function(defaultLog) {
  const all = [...buildHotViews(defaultLog), ...buildColdViews(defaultLog)];
  return runViews(all, 'mat_view_all', defaultLog);
};
