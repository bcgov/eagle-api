const mongoose = require('mongoose');

const constants = require('../helpers/constants').schemaTypes;
const parentReadAggr = require('../helpers/parentReadAggr');

// Schemas that can be published in their own right while their parent is not, so the parent's
// `read[]` decides. Everything else reachable here is either a parent itself (Project,
// ProjectNotification), unowned (List, Organization), or staff-only by its own `read[]`.
const PROJECT_GATED_SCHEMAS = [constants.DOCUMENT, constants.COMMENT_PERIOD, constants.VC];

/**
 * Creates an aggregate for an item.
 *
 * @param {string} itemId Object ID of item to retrieve
 * @param {string} schemaName Name of item schema
 * @param {array} roles List of user roles
 * @returns {array} Aggregate for items
 */
exports.createItemAggr = (itemId, schemaName, roles) => {
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
    aggregation.push(...parentReadAggr(roles));
  } else if (schemaName === constants.COMMENT) {
    // A comment hangs off a comment period, which hangs off a project, so both levels gate it.
    aggregation.push(
      ...parentReadAggr(roles, 'period'),
      {
        '$lookup': {
          'from': 'epic',
          'localField': 'period',
          'foreignField': '_id',
          'as': 'periodParentCheck'
        }
      },
      {
        '$addFields': {
          periodProject: { $arrayElemAt: ['$periodParentCheck.project', 0] }
        }
      },
      ...parentReadAggr(roles, 'periodProject'),
      {
        '$project': { periodParentCheck: 0, periodProject: 0 }
      }
    );
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
