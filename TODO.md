# TODO

## Updates

- 2026-09-23: Add DB tests that drive POST/PUT with the bodies eagle-admin actually sends.
- 2026-09-24: GET `/public/document/{id}` and `/fetch` serve an UPDATE image of a scheduled Update before it goes live (public at save); check the Update is live, or accept.

## Sorting

- 2026-09-24: The List rank prefetch reads every List item. Filter it to `doctype` / `label` once the data confirms Document type and milestone never point at other List types.

## Legislation registry: deferred review findings

- 2026-10-01 api/controllers/project.js:634: a PUT with no `legislationYear` returns 404 when the stored `currentLegislationYear` is missing or not an exact key (`'legislation_2018 '`, old untrimmed publish). Count such rows on test; if any exist, read the stored year suffix with `Number()`.
- 2026-10-01 api/controllers/project.js:741: the 409 for a project that moved under a locked Act before the write names every locked Act joined with "or" (PUT and publish). Read the stored key back and name only that Act; test/controllers/project-locked-act.test.js:161 asserts the joined wording.
- 2026-10-01 api/helpers/demiPush.js:100: `enrichProject` adds proponent and regulation keys to the default-filled 2025 block of 1996, 2002 and 2018 projects (push payload only).
- 2026-10-01 api/helpers/models/project.js:103: every loaded project gains a default `legislation_2025` object, shown in PUT, publish and unpublish responses and the push body, stored on the next `save()`; the `handleProjectTerms` OR at api/helpers/aggregators.js:308 can match it.
- 2026-10-01 api/helpers/models/project.js:103: each Act adds 5 indexes to the shared `epic` collection (limit 64). Check the live index count before a production deploy.
- 2026-10-01 api/aggregators/projectAggregator.js:16: `projectLegislation=all` runs extra lookups per row.
- 2026-10-01 api/aggregators/documentAggregator.js:163: the joined-project strip lists (also recentActivityAggregator.js:86, commentPeriodAggregator.js:59) remove only the 2002 and 1996 blocks.
- 2026-10-01 scripts/demi-repush.js:62: `--since` misses projects changed by PUT.
- 2026-10-01 api/materialized_views/reports/documentTaggingProgressByProject.js:156: report views still read the root `$name` (also projectStatsFull.js:19, projectsWithCompletelyTaggedDocs.js:12 and 150, whoPublishedUnpublishedAllUsers.js:112).
- 2026-09-25: no test covers the `pushClient.logUnsent()` call in `app.js` `shutdown()`. Needs an `app.js` change first: `exports.shutdown` at `app.js:246` is unreachable because `module.exports = app` replaces the exports object.
- 2026-10-13 eagle-api: remove the jobs feature: Agenda queue (api/helpers/jobQueue.js, startJobQueue app.js:194), GET /jobs routes, project-doc-export handler, job.js CSV code. Nothing queues a job since #945; the queue polls Mongo every 5 s per pod. Delete wiki Async-Jobs.md too
