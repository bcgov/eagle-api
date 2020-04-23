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
            performedBy: {
              $ne: 'public'
            }
          },
          {
            action: {
              $ne: 'Get'
            }
          },
          {
            action: {
              $ne: 'Search'
            }
          },
          {
            action: {
              $ne: 'Summary'
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
          {
            timestamp: { $gt: new Date(afterTimestamp) }
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
        latest: true,
      }
    },
  ];

  if (afterTimestamp !== constants.minDate) {
    defaultLog.debug('checking if need to update read_only__reports__changes_non_public');

    const latestSinceLastRun = await mongoose.model('Audit').aggregate(queryAggregates);

    latestSinceLastRun.forEach(recentlyUpdated => {
      const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public');
      collection.updateOne({
        '_id': recentlyUpdated['_id'],
        'latest': { '$ne': recentlyUpdated['latest'] }
      },
      {
        $inc: { 'count': recentlyUpdated['count'] },
        $set: { 'latest': recentlyUpdated['latest'] }
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated '${recentlyUpdated['_id']}' to '${recentlyUpdated['latest']}' and incremented count by ${recentlyUpdated['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__changes_non_public');

    queryAggregates.push({ $out: 'read_only__reports__changes_non_public' });
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
    collection.createIndex({latest: 1});
  }
}

async function get_last(defaultLog) {
  const collection = mongoose.connection.db.collection('read_only__reports__changes_non_public');
  if (!collection) {
    return constants.minDate;
  }

  const result = await collection.find({}, { projection: { '_id':0, 'latest':1 } }).sort({ 'latest': -1 }).limit(1).toArray();

  if (result.length === 0) {
    return constants.minDate;
  }

  defaultLog.debug('last update to non-public changes was: ' + new Date(result[0].latest));

  return new Date(result[0].latest);
}

exports.update = update;
exports.get_last = get_last;