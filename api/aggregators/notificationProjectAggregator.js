/**
 * Creates aggregation required for notifications.
 *
 * @param {boolean} populate Flag to unwind linked schemas
 * @returns {array} Aggregation
 */
exports.createNotificationProjectAggr = (populate) => {
  const aggregation = [];

  if (populate) {
    // Handle project.
    aggregation.push(
      {
        "$lookup": {
          "from": "epic",
          "localField": "project",
          "foreignField": "_id",
          "as": "project"
        }
      },
      {
        "$addFields": {
          project: "$project",
        }
      },
      {
        "$unwind": {
          "path": "$project",
          "preserveNullAndEmptyArrays": true
        }
      }
    );

    aggregation.push(
      {
        $lookup: {
          from: 'epic',
          as: 'documents',
          let: { project: "$_id", schema: 'Document' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$project', '$$project'] },
                    { $eq: ['$_schemaName', 'Document'] }
                  ]
                }
              }
            },
            {
              $redact: {
                $cond: {
                  if: {
                    // This way, if read isn't present, we assume public no roles array.
                    $and: [
                      { $cond: { if: "$read", then: true, else: false } },
                      {
                        $anyElementTrue: {
                          $map: {
                            input: "$read",
                            as: "fieldTag",
                            in: { $setIsSubset: [["$$fieldTag"], ['public']] }
                          }
                        }
                      }
                    ]
                  },
                  then: "$$KEEP",
                  else: {
                    $cond: { if: "$read", then: "$$PRUNE", else: "$$DESCEND" }
                  }
                }
              }
            }
          ]
        }
      }
    );
  }

  return aggregation;
};
