const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        $and: [
          {
            _schemaName: {
              $eq: 'Comment'
            }
          },
          {
            read: {
              $nin: [
                'public'
              ]
            }
          }
        ]
      }
    },
    {
      $group: {
        _id: null,
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
        _id: 'unpublished',
        count: true
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__unpublished_comments');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__unpublished_comments');

    const comments = await mongoose.model('Comment').aggregate(queryAggregates);

    comments.forEach(comment => {
      const collection = mongoose.connection.db.collection('read_only__reports__unpublished_comments');
      collection.updateOne({
        '_id': comment['_id'],
      },
      {
        $set: { 'count': comment['count'] }
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for '${comment['_id']}' and set count to ${comment['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__unpublished_comments');

    queryAggregates.push({ $out: 'read_only__reports__unpublished_comments' });
    await mongoose.model('Comment').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__unpublished_comments');
    collection.createIndex({ _id: 1 });
    collection.createIndex({ count: 1 });
  }
}

exports.update = update;