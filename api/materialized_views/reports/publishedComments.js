const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        $and: [
          {
            _schemaName: {
              $eq: "Comment"
            }
          },
          {
            read: {
              $in: [
                "public"
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
      $project: {
        _id: 'published',
        count: true
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__published_comments');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__published_comments');

    const comments = await mongoose.model('Comment').aggregate(queryAggregates);

    comments.forEach(comment => {
      const collection = mongoose.connection.db.collection('read_only__reports__published_comments');
      collection.updateOne({
        '_id': comment['_id'],
      },
      {
        $set: { count: comment['count'] },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for comment '${comment['_id']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__published_comments');

    queryAggregates.push({ $out: 'read_only__reports__published_comments' });
    await mongoose.model('Comment').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__published_comments');
    collection.createIndex({ _id: 1 });
    collection.createIndex({ count: 1 });
  }
}

exports.update = update;