const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        $expr: {
          $and: [
            {
              $eq: [
                {
                  $toLower: "$_schemaName"
                },
                "document"
              ]
            },
            {
              $eq: [
                {
                  $toLower: "$documentSource"
                },
                "project"
              ]
            }
          ]
        }
      }
    },
    {
      $project: {
        isTagged: {
          $cond: {
            if: {
              $and: [
                {
                  $ne: [
                    "$type",
                    ""
                  ]
                },
                {
                  $ne: [
                    "$type",
                    null
                  ]
                },
                {
                  $eq: [
                    {
                      $type: "$type"
                    },
                    "objectId"
                  ]
                },
                {
                  $ne: [
                    "$milestone",
                    ""
                  ]
                },
                {
                  $ne: [
                    "$milestone",
                    null
                  ]
                },
                {
                  $eq: [
                    {
                      $type: "$milestone"
                    },
                    "objectId"
                  ]
                },
                {
                  $ne: [
                    "$documentAuthorType",
                    ""
                  ]
                },
                {
                  $ne: [
                    "$documentAuthorType",
                    null
                  ]
                },
                {
                  $eq: [
                    {
                      "$type": "$documentAuthorType"
                    },
                    "objectId"
                  ]
                }
              ]
            },
            then: "Tagged",
            else: "Untagged"
          }
        }
      }
    },
    {
      $group: {
        _id: {
          projectName: "$projectName",
          isTagged: "$isTagged"
        },
        count: {
          $sum: 1
        }
      }
    },
    {
      $project: {
        _id: "$_id.isTagged",
        count: "$count"
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_total');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__document_tagging_total');

    const details = await mongoose.model('Document').aggregate(queryAggregates);

    details.forEach(stats => {
      const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_total');
      collection.updateOne({
        '_id': stats['_id'],
      },
      {
        $set: {
          'count': stats['count']
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated '${stats['_id']}' set count to ${stats['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__document_tagging_total');

    queryAggregates.push({ $out: 'read_only__reports__document_tagging_total' });
    await mongoose.model('Document').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_total');
    collection.createIndex({ _id: 1 });
    collection.createIndex({ count: 1 });
  }
}

exports.update = update;