const mongoose = require('mongoose');
const constants = require('../constants');

async function update(defaultLog, afterTimestamp) {
  const queryAggregates = [
    {
      $project: {
        performedBy: '$performedBy',
        action: '$action',
        timestamp: '$timestamp'
      }
    },
    {
      $match: {
        $and: [
          {
            timestamp: { $gt: new Date(afterTimestamp) }
          },
          {
            performedBy: {
              $ne: null
            }
          },
          {
            performedBy: {
              $ne: 'public'
            }
          },
          {
            $or: [
              {
                action: {
                  $eq: 'get'
                }
              },
              {
                action: {
                  $eq: 'search'
                }
              },
              {
                action: {
                  $eq: 'summary'
                }
              },
              {
                action: {
                  $eq: 'Get'
                }
              },
              {
                action: {
                  $eq: 'Search'
                }
              },
              {
                action: {
                  $eq: 'Summary'
                }
              }
            ]
          }
        ]
      }
    },
    {
      $project: {
        _id: '$_id',
        ___group: {
          performedBy: '$performedBy'
        },
        timestamp: '$timestamp'
      }
    },
    {
      $group: {
        _id: '$___group',
        count: {
          $sum: 1
        },
        latest: { $max: '$timestamp' }
      }
    },
    {
      $sort: {
        _id: 1
      }
    },
    {
      $project: {
        _id: '$_id.performedBy',
        count: true,
        latest: true
      }
    }
  ];

  if (afterTimestamp !== constants.minDate){
    defaultLog.debug('checking if need to update read_only__reports__user_all_time');

    const visits = await mongoose.model('Audit').aggregate(queryAggregates);

    visits.forEach(visit => {
      const collection = mongoose.connection.db.collection('read_only__reports__user_all_time');
      collection.updateOne({
        '_id': visit['_id'],
      },
      {
        $inc: { 'count': visit['count'] },
        $set: { 'latest': visit['latest'] }
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for '${visit['_id']}' and incremented count by ${visit['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__user_all_time');

    queryAggregates.push({ $out: 'read_only__reports__user_all_time' });
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__user_all_time');
    collection.createIndex({ _id: 1 });
    collection.createIndex({ count: 1 });
    collection.createIndex({ latest: 1 });
  }
}

async function get_last(defaultLog) {
  const collection = mongoose.connection.db.collection('read_only__reports__user_all_time');
  if (!collection) {
    return constants.minDate;
  }

  const result = await collection.find({}, { projection: { '_id': 0, 'latest': 1 } }).sort({ 'latest': -1 }).limit(1).toArray();

  if (result.length === 0) {
    return constants.minDate;
  }

  defaultLog.debug('last update to search terms was: ' + new Date(result[0].latest));

  return new Date(result[0].latest);
}

exports.update = update;
exports.get_last = get_last;