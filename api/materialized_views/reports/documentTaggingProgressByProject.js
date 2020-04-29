const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        $expr: {
          $eq: [
            {
              $toLower: "$_schemaName"
            },
            "project"
          ]
        }
      }
    },
    {
      $addFields: {
        default: {
          $switch: {
            branches: [
              {
                case: {
                  $eq: [
                    "$currentLegislationYear",
                    "legislation_1996"
                  ]
                },
                then: "$legislation_1996"
              },
              {
                case: {
                  $eq: [
                    "$currentLegislationYear",
                    "legislation_2002"
                  ]
                },
                then: "$legislation_2002"
              },
              {
                case: {
                  $eq: [
                    "$currentLegislationYear",
                    "legislation_2018"
                  ]
                },
                then: "$legislation_2018"
              }
            ],
            default: "$legislation_2002"
          }
        }
      }
    },
    {
      $project: {
        name: "$default.name"
      }
    },
    {
      $lookup: {
        from: "epic",
        let: {
          projectId: "$_id"
        },
        pipeline: [
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
                      "$project",
                      "$$projectId"
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
              documentId: "$_id",
              project: "$project",
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
                project: "$project",
                isTagged: "$isTagged"
              },
              count: {
                $sum: 1
              }
            }
          },
          {
            $project: {
              _id: 0,
              project: "$_id.project",
              status: "$_id.isTagged",
              count: "$count"
            }
          },
          {
            $sort: {
              project: 1,
              status: 1
            }
          }
        ],
        as: "docStats"
      }
    },
    {
      $project: {
        _id: 0,
        project: "$name",
        array0: {
          $arrayElemAt: [
            "$docStats",
            0
          ]
        },
        array1: {
          $arrayElemAt: [
            "$docStats",
            1
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        project: "$project",
        tagged: {
          $cond: [
            {
              $eq: [
                "$array0.status",
                "Tagged"
              ]
            },
            "$array0.count",
            {
              $cond: [
                {
                  $eq: [
                    "$array1.status",
                    "Tagged"
                  ]
                },
                "$array1.count",
                0
              ]
            }
          ]
        },
        untagged: {
          $cond: [
            {
              $eq: [
                "$array0.status",
                "Untagged"
              ]
            },
            "$array0.count",
            {
              $cond: [
                {
                  $eq: [
                    "$array1.status",
                    "Untagged"
                  ]
                },
                "$array1.count",
                0
              ]
            }
          ]
        }
      }
    },
    {
      $project: {
        _id: '$project',
        tagged: '$tagged',
        untagged: '$untagged'
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_by_project');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__document_tagging_by_project');

    const details = await mongoose.model('Document').aggregate(queryAggregates);

    details.forEach(stats => {
      const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_by_project');
      collection.updateOne({
        '_id': stats['_id'],
      },
      {
        $set: {
          'tagged': stats['tagged'],
          'untagged': stats['untagged']
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated '${stats['_id']}' tagged count to '${stats['tagged']}' and untagged count to ${stats['untagged']}`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__document_tagging_by_project');

    queryAggregates.push({ $out: 'read_only__reports__document_tagging_by_project' });
    await mongoose.model('Document').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__document_tagging_by_project');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
    collection.createIndex({status: 1});
  }
}

exports.update = update;