const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        objId: {
          $ne: null
        }
      }
    },
    {
      $addFields: {
        lcaseAction: {
          $toLower: "$action"
        }
      }
    },
    {
      $match: {
        lcaseAction: {
          $in: [
            "publish",
            "unpublish"
          ]
        }
      }
    },
    {
      $lookup: {
        from: "epic",
        let: {
          epicId: "$objId"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  "$_id",
                  "$$epicId"
                ]
              }
            }
          },
          {
            $project: {
              projectId: "$project",
              objectType: "$_schemaName",
              documentDisplayName: "$displayName",
              commentStatus: "$eaoStatus",
              commentPeriodIsClassified: "$isClassified",
              commentPeriodIsPublished: "$isPublished",
              commentPeriodIsResolved: "$isResolved",
              commentPeriodIsVetted: "$isVetted",
              recentActivityHeadline: "$headline",
              recentActivityPinned: "$pinned",
              recentActivityActive: "$active"
            }
          }
        ],
        as: "epicObjects"
      }
    },
    {
      $unwind: "$epicObjects"
    },
    {
      $project: {
        updatedBy: "$updatedBy",
        addedBy: "$addedBy",
        delete: "$delete",
        _schemaName: "$_schemaName",
        timestamp: "$timestamp",
        read: "$read",
        action: "$lcaseAction",
        deletedBy: "$deletedBy",
        objectId: "$objId",
        objectType: "$epicObjects.objectType",
        documentDisplayName: "$epicObjects.documentDisplayName",
        commentStatus: "$epicObjects.commentStatus",
        commentPeriodIsClassified: "$epicObjects.commentPeriodIsClassified",
        commentPeriodIsPublished: "$epicObjects.commentPeriodIsPublished",
        commentPeriodIsResolved: "$epicObjects.commentPeriodIsResolved",
        commentPeriodIsVetted: "$epicObjects.commentPeriodIsVetted",
        recentActivityHeadline: "$epicObjects.recentActivityHeadline",
        recentActivityPinned: "$epicObjects.recentActivityPinned",
        recentActivityActive: "$epicObjects.recentActivityActive",
        projectId: "$epicObjects.projectId",
        _id: "$_id",
        meta: "$meta",
        write: "$write",
        performedBy: "$performedBy",
        _objectSchema: "$_objectSchema"
      }
    },
    {
      $lookup: {
        from: "epic",
        let: {
          epicId: "$projectId"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: [
                      "$_id",
                      "$$epicId"
                    ]
                  },
                  {
                    $eq: [
                      {
                        $toLower: "$_schemaName"
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
              _id: 0,
              name: "$name"
            }
          }
        ],
        as: "projectObjects"
      }
    },
    {
      $unwind: "$projectObjects"
    },
    {
      $sort: {
        "timestamp": -1
      }
    },
    {
      $project: {
        timestamp: {
          $dateFromParts: {
            year: {
              $year: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            month: {
              $month: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            day: {
              $dayOfMonth: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            hour: {
              $hour: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            minute: {
              $minute: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            second: {
              $second: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            millisecond: {
              $millisecond: {
                date: "$timestamp",
                timezone: "America/Vancouver"
              }
            },
            timezone: "UTC"
          }
        },
        objectType: "$objectType",
        projectName: "$projectObjects.name",
        action: "$action",
        performedBy: "$performedBy",
        documentDisplayName: {
          $cond: {
            if: {
              $eq: [
                "Document",
                "$objectType"
              ]
            },
            then: "$documentDisplayName",
            else: {
              $literal: ""
            }
          }
        },
        commentStatus: {
          $cond: {
            if: {
              $eq: [
                "Comment",
                "$objectType"
              ]
            },
            then: "$commentStatus",
            else: {
              $literal: ""
            }
          }
        },
        recentActivityHeadline: {
          $cond: {
            if: {
              $eq: [
                "RecentActivity",
                "$objectType"
              ]
            },
            then: "$recentActivityHeadline",
            else: {
              $literal: ""
            }
          }
        },
        recentActivityPinned: {
          $cond: {
            if: {
              $eq: [
                "RecentActivity",
                "$objectType"
              ]
            },
            then: "$recentActivityPinned",
            else: {
              $literal: ""
            }
          }
        },
        recentActivityActive: {
          $cond: {
            if: {
              $eq: [
                "RecentActivity",
                "$objectType"
              ]
            },
            then: "$recentActivityActive",
            else: {
              $literal: ""
            }
          }
        },
        commentPeriodIsResolved: {
          $cond: {
            if: {
              $eq: [
                "CommentPeriod",
                "$objectType"
              ]
            },
            then: "$commentPeriodIsResolved",
            else: {
              $literal: ""
            }
          }
        },
        commentPeriodIsPublished: {
          $cond: {
            if: {
              $eq: [
                "CommentPeriod",
                "$objectType"
              ]
            },
            then: "$commentPeriodIsPublished",
            else: {
              $literal: ""
            }
          }
        },
        commentPeriodIsVetted: {
          $cond: {
            if: {
              $eq: [
                "CommentPeriod",
                "$objectType"
              ]
            },
            then: "$commentPeriodIsVetted",
            else: {
              $literal: ""
            }
          }
        },
        commentPeriodIsClassified: {
          $cond: {
            if: {
              $eq: [
                "CommentPeriod",
                "$objectType"
              ]
            },
            then: "$commentPeriodIsClassified",
            else: {
              $literal: ""
            }
          }
        },
        deletedBy: "$deletedBy",
        updatedBy: "$updatedBy",
        addedBy: "$addedBy",
        _objectSchema: "$_objectSchema",
        _schemaName: "$_schemaName",
        objectId: "$objectId",
        projectId: "$projectId",
        _id: "$_id",
        meta: "$meta",
        read: "$read",
        write: "$write",
        delete: "$delete"
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__who_published_all_users');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__who_published_all_users');

    const details = await mongoose.model('Audit').aggregate(queryAggregates);

    details.forEach(detail => {
      const collection = mongoose.connection.db.collection('read_only__reports__who_published_all_users');
      collection.updateOne({
        '_id': detail['_id'],
      },
      {
        $set: {
          'timestamp': detail['timestamp'],
          'objectType': detail['objectType'],
          'projectName': detail['projectName'],
          'action': detail['action'],
          'performedBy': detail['performedBy'],
          'documentDisplayName': detail['documentDisplayName'],
          'commentStatus': detail['commentStatus'],
          'recentActivityHeadline': detail['recentActivityHeadline'],
          'recentActivityPinned': detail['recentActivityPinned'],
          'recentActivityActive': detail['recentActivityActive'],
          'commentPeriodIsResolved': detail['commentPeriodIsResolved'],
          'commentPeriodIsPublished': detail['commentPeriodIsPublished'],
          'commentPeriodIsVetted': detail['commentPeriodIsVetted'],
          'commentPeriodIsClassified': detail['commentPeriodIsClassified'],
          'deletedBy': detail['deletedBy'],
          'updatedBy': detail['updatedBy'],
          'addedBy': detail['addedBy'],
          '_objectSchema': detail['_objectSchema'],
          '_schemaName': detail['_schemaName'],
          'objectId': detail['objectId'],
          'projectId': detail['projectId'],
          '_id': detail['_id'],
          'meta': detail['meta'],
          'read': detail['read'],
          'write': detail['write'],
          'delete': detail['delete']
        }
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for '${detail['_id']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__who_published_all_users');

    queryAggregates.push({ $out: 'read_only__reports__who_published_all_users' });
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__who_published_all_users');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;