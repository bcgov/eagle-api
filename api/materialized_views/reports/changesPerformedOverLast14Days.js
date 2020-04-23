const mongoose = require('mongoose');
const moment = require('moment');

async function update(defaultLog) {
  // Set the limit for number of days to pull for the report.
  const dateLimit = moment().subtract(14, 'days').format('YYYY-MM-DD');

  const queryAggregates = [
    {
      $project: {
        performedBy: "$performedBy",
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
        },
        action: "$action"
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
            timestampDay: {
              $gte: {
                ___date: dateLimit
              },
            }
          },
          {
            action: {
              $ne: "get"
            }
          },
          {
            action: {
              $ne: "search"
            }
          },
          {
            action: {
              $ne: "summary"
            }
          },
          {
            action: {
              $ne: "Get"
            }
          },
          {
            action: {
              $ne: "Search"
            }
          },
          {
            action: {
              $ne: "Summary"
            }
          },
          {
            performedBy: {
              $ne: null
            }
          },
          {
            performedBy: {
              $ne: ''
            }
          },
        ]
      }
    },
    {
      $group: {
        _id: "$performedBy",
        count: {
          $sum: 1
        },
      }
    },
    {
      $project: {
        _id: true,
        count: true,
      }
    },
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public_last_14');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { "_id": 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__changes_non_public_last_14');

    const latestSinceLastRun = await mongoose.model('Audit').aggregate(queryAggregates);

    latestSinceLastRun.forEach(recentlyUpdated => {
      const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public_last_14');
      collection.updateOne({
        '_id': recentlyUpdated['_id'],
      },
      {
        $set: {
          'count': recentlyUpdated['count']
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated '${recentlyUpdated['_id']}' to ${recentlyUpdated['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__changes_non_public_last_14');

    queryAggregates.push({ $out: 'read_only__reports__changes_non_public_last_14' });
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public_last_14');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
  }
}

exports.update = update;