const mongoose = require('mongoose');
const { DateTime } = require('luxon');

async function update(defaultLog) {
  // Set the limit for number of days to pull for the report.
  const dateLimit = DateTime.now().minus({ days: 14 }).toFormat('yyyy-MM-dd');

  // Pre-filter on real timestamp field so MongoDB can use an index before
  // the $project stage that computes the derived timestampDay field.
  const dateLimitDate = new Date(dateLimit);

  const queryAggregates = [
    {
      $match: {
        timestamp: { $gte: dateLimitDate }
      }
    },
    {
      $project: {
        performedBy: "$performedBy",
        action: "$action",
        timestampDay: {
          $let: {
            vars: {
              column: "$timestamp"
            },
            in: {
              ___date: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$$column"
                }
              }
            }
          }
        }
      }
    },
    {
      $match: {
        $and: [
          {
            performedBy: {
              $ne: "public"
            }
          },
          {
            performedBy: {
              $ne: null
            }
          },
          {
            $or: [
              {
                action: {
                  $eq: "search"
                }
              },
              {
                action: {
                  $eq: "summary"
                }
              },
              {
                action: {
                  $eq: "get"
                }
              },
              {
                action: {
                  $eq: "Search"
                }
              },
              {
                action: {
                  $eq: "Summary"
                }
              },
              {
                action: {
                  $eq: "Get"
                }
              }
            ]
          },
          {
            timestampDay: {
              $gte: {
                ___date: dateLimit
              },
            }
          }
        ]
      }
    },
    {
      $project: {
        _id: "$_id",
        ___group: {
          performedBy: "$performedBy"
        }
      }
    },
    {
      $group: {
        _id: "$___group",
        count: {
          $sum: 1
        }
      }
    },
    {
      $sort: {
        _id: 1
      }
    },
    {
      $project: {
        _id: "$_id.performedBy",
        count: true
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__users_last_14');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__users_last_14');

    const visits = await mongoose.model('Audit').aggregate(queryAggregates);

    const ops = visits.map(visit => ({
      updateOne: {
        filter: { _id: visit['_id'] },
        update: { $set: { count: visit['count'] } },
        upsert: true
      }
    }));
    if (ops.length) await collection.bulkWrite(ops, { ordered: false });
    defaultLog.debug(`bulkWrite ${ops.length} ops to read_only__reports__users_last_14`);
  } else {
    defaultLog.debug('initializing read_only__reports__users_last_14');

    queryAggregates.push({ $out: 'read_only__reports__users_last_14' });
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__users_last_14');
    collection.createIndex({ _id: 1 });
    collection.createIndex({ count: 1 });
  }
}

exports.update = update;
