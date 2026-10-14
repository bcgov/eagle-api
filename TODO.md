# TODO

## Updates

- 2026-09-23: Add DB tests that drive POST/PUT with the bodies eagle-admin actually sends.
- 2026-09-24: GET `/public/document/{id}` and `/fetch` serve an UPDATE image of a scheduled Update before it goes live (public at save); check the Update is live, or accept.

## Sorting

- 2026-09-24: The List rank prefetch reads every List item. Filter it to `doctype` / `label` once the data confirms Document type and milestone never point at other List types.

## Legislation registry: deferred review findings

- 2026-10-01 api/controllers/project.js:643: PUT with no `legislationYear` answers 404 when stored `currentLegislationYear` is missing or not an exact key (`'legislation_2018 '`). Count such rows on test; if any, parse the year suffix.
- 2026-10-01 api/controllers/project.js:754, :812: the moved-under-locked-Act 409 names every locked Act joined with "or". Read the stored key back and name only that Act; update test/controllers/project-locked-act.test.js:161.
- 2026-10-01 api/helpers/demiPush.js:100: `enrichProject` adds proponent and regulation keys to the default-filled 2025 block of 1996, 2002 and 2018 projects (push payload only).
- 2026-10-01 api/helpers/models/project.js:103: every loaded project gains a default `legislation_2025` object, shown in PUT, publish and unpublish responses and the push body, stored on the next `save()`; the `handleProjectTerms` OR at api/helpers/aggregators.js:308 can match it.
- 2026-10-01 api/helpers/models/project.js:103: each Act adds 5 indexes to the shared `epic` collection (limit 64). Check the live index count before a production deploy.
- 2026-10-01 api/aggregators/projectAggregator.js:16: `projectLegislation=all` runs extra lookups per row.
- 2026-10-01 api/aggregators/documentAggregator.js:163: the joined-project strip lists (also recentActivityAggregator.js:86, commentPeriodAggregator.js:59) remove only the 2002 and 1996 blocks.
- 2026-10-01 scripts/demi-repush.js:62: `--since` misses projects changed by PUT.
- 2026-10-01 api/materialized_views/reports/documentTaggingProgressByProject.js:156: report views still read the root `$name` (also projectStatsFull.js:19, projectsWithCompletelyTaggedDocs.js:12 and 150, whoPublishedUnpublishedAllUsers.js:112).
- 2026-09-25: add a test for `pushClient.logUnsent()` in `app.js` `shutdown()`. First make `exports.shutdown` (`app.js:247`) reachable: `module.exports = app` (:246) replaces the exports object.
- 2026-10-13 eagle-api: remove the jobs feature: Agenda queue (api/helpers/jobQueue.js, startJobQueue app.js:194), GET /jobs routes, project-doc-export handler, job.js CSV code. Nothing queues a job since #945; the queue polls Mongo every 5 s per pod. Delete wiki Async-Jobs.md too
