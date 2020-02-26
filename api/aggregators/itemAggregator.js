const mongoose = require('mongoose');

const constants = require('../helpers/constants').schemaTypes;

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

  aggregation.push(
    {
      '$match': { _id: mongoose.Types.ObjectId(itemId) }
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
                    in: { $setIsSubset: [['$$fieldTag'], roles] }
                  }
                }
              }
            ]
          },
          then: '$$KEEP',
          else: {
            $cond: { if: '$read', then: '$$PRUNE', else: '$$DESCEND' }
          }
        }
      }
    }
  );

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
