# TODO

## Updates

- 2026-09-23: Pin toggle on a published Update re-runs the public-document check on its featured image and attachments; skip it when only `pinned` changes.
- 2026-09-23: Search `and=status=a,b` is not split on commas for RecentActivity status; split it like other list filters.
- 2026-09-23: `hasTag` in `api/helpers/updateRules.js` also rejects plain text such as `<3` followed by letters; narrow it to real tag names.
- 2026-09-23: Hide `_deletedBy` from public Update payloads along with `notifiedAt`, `_addedBy`, `_updatedBy`.
- 2026-09-23: `nonPublicDocumentIds` Document lookup should match `_schemaName: 'Document'` and skip `isDeleted` rows.
- 2026-09-23: Security: public search filters (`and`/`or`) can match on fields hidden from the response (staff usernames in `_addedBy`/`_updatedBy`, `notifiedAt`), so a caller can probe their values; reject hidden keys in public filters.
- 2026-09-23: Add DB tests that drive POST/PUT with the bodies eagle-admin actually sends.
- 2026-09-24 eagle-api: `documentAggregator.js:97` `signedIn` repeats the isAuthenticated test at `search.js:227`; pass the flag in.
- 2026-09-24 eagle-api: GET `/public/document/{id}` and `/fetch` serve an UPDATE image of a scheduled Update before it goes live (public at save); check the Update is live, or accept.
- 2026-09-24 eagle-api: `updateImages.js:129` release saves a doc loaded earlier, so a concurrent save gets a VersionError. It is caught and the image stays public; say so in the log line.
