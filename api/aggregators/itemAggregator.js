const mongoose = require('mongoose');

const constants = require('../helpers/constants').schemaTypes;
const parentRead = require('../helpers/parentRead');

// Not in schemaTypes: search.js builds its dataset allow-list from those values, and there is no
// Vc dataset pipeline. Item reaches a Vc by _schemaName only.
const VC_SCHEMA = 'Vc';

// Gated on the parent's `read[]`. Project and ProjectNotification are parents themselves; List and
// Organization have none. RecentActivity and Inspection do hang off a project but are out of scope
// here: they leak the same way through their own list aggregators, so both paths get fixed together.
const PROJECT_GATED_SCHEMAS = [constants.DOCUMENT, constants.COMMENT_PERIOD, VC_SCHEMA];

/**
 * Reads the parent sets this schema's gate needs, for createItemAggr's `gate` argument. A schema
 * with no parent costs no query.
 */
exports.resolveParentGate = async (schemaName, roles) => {
  if (PROJECT_GATED_SCHEMAS.includes(schemaName)) {
    return { unreadableParentIds: await parentRead.unreadableParentIds(roles) };
  }

  if (schemaName === constants.COMMENT) {
    return { unreadablePeriodIds: await parentRead.unreadablePeriodIds(roles) };
  }

  return {};
};

/**
 * Creates an aggregate for an item.
 *
 * @param {string} itemId Object ID of item to retrieve
 * @param {string} schemaName Name of item schema
 * @param {array} roles List of user roles
 * @param {object} gate Parent ids from resolveParentGate
 * @returns {array} Aggregate for items
 */
exports.createItemAggr = (itemId, schemaName, roles, gate) => {
  // Fails closed: without the gate a caller would silently get an ungated pipeline.
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new TypeError('createItemAggr needs the gate object from resolveParentGate; the parent gate is not optional');
  }

  const aggregation = [];

  // Ensure 'public' is always included in roles for permission checks
  // Authenticated users should still see publicly available content
  const rolesWithPublic = roles.includes('public') ? roles : [...roles, 'public'];

  aggregation.push(
    {
      '$match': { _id: new mongoose.Types.ObjectId(itemId) }
    },
    {
      $redact: {
        $cond: {
          if: {
            // This way, if read isn't present, we assume public no roles array.
            $and: [
              { $cond: { if: '$read', then: true, else: false } },
              {
                $anyElementTrue: {
                  $map: {
                    input: '$read',
                    as: 'fieldTag',
                    in: { $setIsSubset: [['$$fieldTag'], rolesWithPublic] }
                  }
                }
              }
            ]
          },
          then: '$$KEEP',
          else: {
            $cond: { if: '$read', then: '$$PRUNE', else: '$$PRUNE' }
          }
        }
      }
    }
  );

  if (PROJECT_GATED_SCHEMAS.includes(schemaName)) {
    aggregation.push(...parentRead.parentReadMatch(gate.unreadableParentIds));
  } else if (schemaName === constants.COMMENT) {
    // A comment hangs off a comment period, which hangs off a project. Both levels gate it, and
    // unreadablePeriodIds already folds the project level into the period set.
    aggregation.push(...parentRead.parentReadMatch(gate.unreadablePeriodIds, 'period'));
  }

  if (schemaName === constants.INSPECTION) {
    // pop elements and their items.
    aggregation.push(
      {
        '$lookup': {
          'from': 'epic',
          'localField': 'elements',
          'foreignField': '_id',
          'as': 'elements'
        }
      },
      {
        '$lookup': {
          'from': 'epic',
          'localField': 'project',
          'foreignField': '_id',
          'as': 'project'
        }
      },
      {
        '$addFields': {
          project: '$project',
        }
      },
      {
        '$unwind': {
          'path': '$project',
          'preserveNullAndEmptyArrays': true
        }
      }
    );
  } else if (schemaName === constants.INSPECTION_ELEMENT) {
    aggregation.push(
      {
        '$lookup': {
          'from': 'epic',
          'localField': 'items',
          'foreignField': '_id',
          'as': 'items'
        }
      }
    );
  }

  return aggregation;
};
