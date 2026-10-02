# TODO

## Updates

- 2026-09-23: Add DB tests that drive POST/PUT with the bodies eagle-admin actually sends.
- 2026-09-24 eagle-api: `documentAggregator.js:97` `signedIn` repeats the isAuthenticated test at `search.js:227`; pass the flag in.
- 2026-09-24 eagle-api: GET `/public/document/{id}` and `/fetch` serve an UPDATE image of a scheduled Update before it goes live (public at save); check the Update is live, or accept.
- 2026-09-24 eagle-api: `updateImages.js:129` release saves a doc loaded earlier, so a concurrent save gets a VersionError. It is caught and the image stays public; say so in the log line.

## Sorting

- 2026-09-24: `documentAggregator.js` rank prefetch hard-codes the collation `{ locale: 'en', strength: 2 }`, a copy of `aggregateCollation` in `search.js`. Rank order only matches the joined order while the two agree; share one constant.
- 2026-09-24: The rank prefetch `.exec()` has no `maxTimeMS`; give it the same 45000 ms as the main query.
- 2026-09-24: The List rank prefetch reads every List item, and a `type,milestone` sort runs it twice. Run it once per call, and filter to `doctype` / `label` once the data confirms Document type and milestone never point at other List types.
- 2026-09-24: The Project rank prefetch runs the proponent `$lookup` for every key; only `project.proponent.*` needs it.
- 2026-09-24: The `ponytail:` note on the rank sort names only collection size; cost is matched Documents times rank array length (`$indexOfArray` is a linear scan).
- 2026-09-24: Rename the local `PROJECT_ROOT_FIELDS` in `search.js` (it adds `_id`, unlike `aggregateHelper.PROJECT_ROOT_FIELDS`), for example `PROJECT_ROOT_SORT_FIELDS`.
- 2026-09-24: `utils.js` `exports.runDataQuery =async function` is missing a space after `=`.

## Legislation registry: deferred review findings

- 2026-10-01 api/controllers/project.js:634: a PUT with no `legislationYear` returns 404 when the stored `currentLegislationYear` is not an exact key (for example `'legislation_2018 '`, written by the old publish that did not trim) or is missing. Develop wrote the first case and threw on the second. Staff forms always send the year. Count such rows on test; if any exist, read the stored year suffix with `Number()`.
- 2026-10-01 api/controllers/project.js:619: no test for a PUT that moves a 1996, 2002 or 2018 project to 2025 (allowed, and one-way after that).
- 2026-10-01 api/dao/projectDAO.js:53: `publishProject` sets `currentLegislationYear` with no lock and no content check; its only caller is its own test. Delete it, or send it through the controller checks.
- 2026-10-01 api/helpers/constants.js:54: nothing checks at load time that exactly one entry has `isDefault`; only a test does. Throw at load when the count is not 1.
- 2026-10-01 api/controllers/project.js:741: the 409 for a project that moved under a locked Act before the write names every guarded locked Act joined with "or" (PUT and publish). Read the stored key back and name only that Act. test/controllers/project-locked-act.test.js:161 asserts the joined wording.
- 2026-10-01 api/controllers/project.js:775: a non-numeric year on a locked project gets 404 from publish but 409 from PUT.
- 2026-10-01 api/controllers/project.js:401, 627, 766: `Number()` reads `'0x7D2'` and `'2.018e3'` as 2018. Harmless.
- 2026-10-01 api/swagger/swagger.yaml:1348: the PUT "404" text should say a locked project gets 409 first. Line 1438: the publish "404" response has no `$ref: "#/definitions/Error"`.
- 2026-10-01 api/helpers/demiPush.js:100: `enrichProject` adds proponent and regulation keys to the default-filled 2025 block of 1996, 2002 and 2018 projects (push payload only).
- 2026-10-01 test/controllers/analytics-callsites.test.js:80, test/controllers/demi-push-callsites.test.js:100: only fixtures changed here; check these tests still fail when the code they cover breaks.
- 2026-10-01 api/helpers/models/project.js:103: every loaded project gains a default `legislation_2025` object. It shows in PUT, publish and unpublish responses and in the push body, and is stored on the next `save()`. The `handleProjectTerms` OR at api/helpers/aggregators.js:308 can match its defaults.
- 2026-10-01 api/helpers/models/project.js:103: each Act adds 5 indexes to the shared `epic` collection (limit 64). Check the live index count before a production deploy.
- 2026-10-01 api/aggregators/projectAggregator.js:16: `projectLegislation=all` runs extra lookups per row.
- 2026-10-01 api/aggregators/documentAggregator.js:163: the joined-project strip lists (also recentActivityAggregator.js:86, commentPeriodAggregator.js:59) remove only the 2002 and 1996 blocks.
- 2026-10-01 scripts/demi-repush.js:62: `--since` misses projects changed by PUT.
- 2026-10-01 api/materialized_views/reports/documentTaggingProgressByProject.js:156: report views still read the root `$name` (also projectStatsFull.js:19, projectsWithCompletelyTaggedDocs.js:12 and 150, whoPublishedUnpublishedAllUsers.js:112).
- 2026-10-02 eagle-admin src/app/services/project.service.ts:122-123: the admin app cannot load a project where exactly one of `projectLeadId` and `responsibleEPDId` is null. The checks read `id !== null && id !== '' || id !== undefined`, so line 137 or 138 calls `.toString()` on undefined; both null works (line 115 returns early). Fix: `id != null && id !== ''` for each. The admin forms always send both ids, so only an API caller can create that state.
