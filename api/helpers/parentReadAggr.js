/**
 * Aggregation stages that drop a record whose parent is not readable by the caller.
 *
 * A record's own `read[]` says nothing about its parent, so a published comment period under an
 * unpublished project used to come back to anonymous callers. Projects, ProjectNotifications and
 * their children all live in the `epic` collection, so one lookup on the `project` reference
 * covers both kinds of parent.
 *
 * The predicate mirrors the own-`read[]` gate in api/aggregators/documentAggregator.js: a missing
 * or empty `read[]` means public, anything else must intersect the caller's roles. A record whose
 * parent reference resolves to nothing keeps only its own gate, which the caller applies.
 *
 * @param {array} roles Caller's roles
 * @returns {array} Aggregation stages, self-cleaning (the temporary fields are projected away)
 */
const parentReadAggr = (roles) => {
  const callerRoles = Array.isArray(roles) ? roles : [];

  // Authenticated users should still see publicly available content.
  const rolesWithPublic = callerRoles.includes('public') ? callerRoles : [...callerRoles, 'public'];

  return [
    {
      $lookup: {
        from: 'epic',
        localField: 'project',
        foreignField: '_id',
        as: 'parentReadCheck'
      }
    },
    {
      // `_id` is unique, so the lookup yields at most one parent.
      $addFields: {
        parentRead: { $arrayElemAt: ['$parentReadCheck.read', 0] }
      }
    },
    {
      $match: {
        $or: [
          { parentRead: { $exists: false } },
          { parentRead: { $size: 0 } },
          { parentRead: { $in: rolesWithPublic } }
        ]
      }
    },
    {
      $project: { parentReadCheck: 0, parentRead: 0 }
    }
  ];
};

module.exports = parentReadAggr;
