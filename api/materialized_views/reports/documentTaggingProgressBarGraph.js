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
      $lookup: {
        from: "epic",
        localField: "project",
        foreignField: "_id",
        as: "projectObjects"
      }
    },
    {
      $unwind: "$projectObjects"
    },
    {
      $project: {
        _schemaName: "$_schemaName",
        projectName: "$projectObjects.name",
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
                      $type: "$documentAuthorType"
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

  const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_bar_graph');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__document_tagging_bar_graph');

    const stats = await mongoose.model('Document').aggregate(queryAggregates);

    stats.forEach(status => {
      const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_bar_graph');
      collection.updateOne({
        '_id': status['_id'],
      },
      {
        $set: {
          'count': status['count']
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated '${status['_id']}' count to ${status['count']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__document_tagging_bar_graph');

    queryAggregates.push({ $out: 'read_only__reports__document_tagging_bar_graph' });
    await mongoose.model('Document').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_bar_graph');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
  }
}

exports.update = update;