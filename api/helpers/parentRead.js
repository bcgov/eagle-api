/**
 * Which parents a caller cannot read, and the stage that drops their children.
 *
 * A record's own `read[]` says nothing about its parent, so a published comment period under an
 * unpublished project used to reach anonymous callers. The parent set is a few hundred rows, so
 * it is resolved once per request: joining the parent onto every matched row instead put a
 * $lookup ahead of $sort/$skip/$limit and cost 4x on a 100k document search.
 *
 * A parent hides its children only when it exists, carries a non-empty `read[]`, and that `read[]`
 * shares no role with the caller. Everything else stays visible.
 */

'use strict';

const defaultLog = require('winston').loggers.get('default');
const mongoose = require('mongoose');

const PARENT_SCHEMAS = ['Project', 'ProjectNotification'];

// Authenticated users should still see publicly available content.
const rolesWithPublic = (roles) => {
  const callerRoles = Array.isArray(roles) ? roles : [];
  return callerRoles.includes('public') ? callerRoles : [...callerRoles, 'public'];
};

// `read.0` is the non-empty test: an empty or absent read[] means public.
const unreadableBy = (roles) => ({
  'read.0': { $exists: true },
  read: { $nin: rolesWithPublic(roles) }
});

const idsMatching = async (query) => {
  const rows = await mongoose.connection.db.collection('epic')
    .find(query, { projection: { _id: 1 } })
    // idx_schemaName_en carries this collation; without it the _schemaName match cannot use it.
    .collation({ locale: 'en', strength: 2 })
    .toArray();

  return rows.map(row => row._id);
};

/**
 * Ids of the projects and project notifications the caller cannot read.
 */
exports.unreadableParentIds = async (roles) => {
  const ids = await idsMatching({ _schemaName: { $in: PARENT_SCHEMAS }, ...unreadableBy(roles) });
  defaultLog.debug('parent read gate: %d unreadable parents', ids.length);

  return ids;
};

/**
 * Ids of the comment periods that hide their comments, either on their own `read[]` or because
 * their project hides them. Folding both levels in here keeps the comment gate a single $match.
 */
exports.unreadablePeriodIds = async (roles) => {
  const parents = await exports.unreadableParentIds(roles);
  const ids = await idsMatching({
    _schemaName: 'CommentPeriod',
    $or: [unreadableBy(roles), { project: { $in: parents } }]
  });
  defaultLog.debug('parent read gate: %d unreadable comment periods', ids.length);

  return ids;
};

/**
 * The gate. $nin does not match a row whose parent field is absent or points at a parent that is
 * gone, so those keep only their own `read[]`, which the caller applies. Empty when the caller can
 * read every parent.
 */
exports.parentReadMatch = (unreadableIds, parentField = 'project') => {
  if (!Array.isArray(unreadableIds) || unreadableIds.length === 0) {
    return [];
  }

  return [{ $match: { [parentField]: { $nin: unreadableIds } } }];
};
