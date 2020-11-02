const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        $expr: {
          $eq: [
            {
              $toLower: '$_schemaName'
            },
            'project'
          ]
        }
      }
    },
    {
      $project: {
        name: '$name'
      }
    },
    {
      $lookup: {
        from: 'epic',
        let: {
          projectId: '$_id'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: [
                      {
                        $toLower: '$_schemaName'
                      },
                      'document'
                    ]
                  },
                  {
                    $eq: [
                      '$project',
                      '$$projectId'
                    ]
                  },
                  {
                    $eq: [
                      {
                        $toLower: '$documentSource'
                      },
                      'project'
                    ]
                  }
                ]
              }
            }
          },
          {
            $project: {
              documentId: '$_id',
              project: '$project',
              isTagged: {
                $cond: {
                  if: {
                    $and: [
                      {
                        $ne: [
                          '$type',
                          ''
                        ]
                      },
                      {
                        $ne: [
                          '$type',
                          null
                        ]
                      },
                      {
                        $eq: [
                          {
                            $type: '$type'
                          },
                          'objectId'
                        ]
                      },
                      {
                        $ne: [
                          '$milestone',
                          ''
                        ]
                      },
                      {
                        $ne: [
                          '$milestone',
                          null
                        ]
                      },
                      {
                        $eq: [
                          {
                            '$type': '$milestone'
                          },
                          'objectId'
                        ]
                      },
                      {
                        $ne: [
                          '$documentAuthorType',
                          ''
                        ]
                      },
                      {
                        $ne: [
                          '$documentAuthorType',
                          null
                        ]
                      },
                      {
                        $eq: [
                          {
                            $type: '$documentAuthorType'
                          },
                          'objectId'
                        ]
                      }
                    ]
                  },
                  then: 'Tagged',
                  else: 'Untagged'
                }
              }
            }
          },
          {
            $group: {
              _id: {
                project: '$project',
                isTagged: '$isTagged'
              },
              count: {
                $sum: 1
              }
            }
          },
          {
            $project: {
              _id: 0,
              project: '$_id.project',
              status: '$_id.isTagged',
              count: '$count'
            }
          },
          {
            $sort: {
              project: 1,
              status: 1
            }
          }
        ],
        as: 'docStats'
      }
    },
    {
      $project: {
        _id: 0,
        project: '$name',
        array0: {
          $arrayElemAt: [
            '$docStats',
            0
          ]
        },
        array1: {
          $arrayElemAt: [
            '$docStats',
            1
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        project: '$project',
        tagged: {
          $cond: [
            {
              $eq: [
                '$array0.status',
                'Tagged'
              ]
            },
            '$array0.count',
            {
              $cond: [
                {
                  $eq: [
                    '$array1.status',
                    'Tagged'
                  ]
                },
                '$array1.count',
                0
              ]
            }
          ]
        },
        untagged: {
          $cond: [
            {
              $eq: [
                '$array0.status',
                'Untagged'
              ]
            },
            '$array0.count',
            {
              $cond: [
                {
                  $eq: [
                    '$array1.status',
                    'Untagged'
                  ]
                },
                '$array1.count',
                0
              ]
            }
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        project: '$project',
        hasUntagged: {
          $cond: [
            {
              $gt: [
                '$untagged',
                0
              ]
            },
            1,
            0
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        projectName: '$project',
        inProgress: {
          $cond: {
            if: {
              $eq: [
                1,
                '$hasUntagged'
              ]
            },
            then: {
              $literal: 'In Progress'
            },
            else: {
              $literal: 'Completely Tagged'
            }
          }
        }
      }
    },
    {
      $group: {
        _id: '$inProgress',
        count: {
          $sum: 1
        }
      }
    },
    {
      $project: {
        _id: 0,
        completelyTagged: {
          $cond: {
            if: {
              $eq: ['$_id', 'Completely Tagged']
            },
            then: '$count',
            else: 0
          }
        },
        inProgress: {
          $cond: {
            if: {
              $eq: ['$_id', 'In Progress']
            },
            then: '$count',
            else: 0
          }
        }
      }
    },
    {
      $group: {
        _id: 'result',
        completelyTagged: {
          $sum: '$completelyTagged'
        },
        inProgress: {
          $sum: '$inProgress'
        }
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__projects_completely_tagged_docs');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__projects_completely_tagged_docs');

    const [ stats ] = await mongoose.model('Project').aggregate(queryAggregates);

    // Should always be a single result.
    if (stats) {
      const collection = mongoose.connection.db.collection('read_only__reports__projects_completely_tagged_docs');
      collection.updateOne({
        '_id': 'Completely Tagged',
      },
      {
        $set: { 'count': stats.completelyTagged },
      },
      {
        upsert: true,
      });
      defaultLog.debug(`updated 'Completely Tagged' to ${stats.completelyTagged}`);

      collection.updateOne({
        '_id': 'In Progress',
      },
      {
        $set: { 'count': stats.inProgress },
      },
      {
        upsert: true,
      });
      defaultLog.debug(`updated 'In Progress' to ${stats.inProgress}`);
    }
  } else {
    defaultLog.debug('initializing read_only__reports__projects_completely_tagged_docs');

    queryAggregates.push({ $out: 'read_only__reports__projects_completely_tagged_docs' });
    await mongoose.model('Project').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__projects_completely_tagged_docs');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
  }
}

exports.update = update;