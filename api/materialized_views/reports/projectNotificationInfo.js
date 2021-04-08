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
            'projectnotification'
          ]
        }
      }
    },
    {
      $project: {
        name: 1,
        type: 1,
        subType: 1,
        proponent: 1,
        trigger: 1,
        region: 1,
        decision: 1,
        decisionDate: 1,
        associatedProjectName: 1,
        location: 1,
        centroid: 1,
        description: 1,
        notificationThresholdValue: 1,
        notificationThresholdUnits: 1,
        notificationReceivedDate: 1,
        nature: 1
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__project_notification_info');
  let result;
  if (collection) {
    result = await collection
      .find({}, { projection: { _id: 1 } })
      .limit(1)
      .toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__project_notification_info');

    const projects = await mongoose.model('ProjectNotification').aggregate(queryAggregates);

    projects.forEach(projectNotification => {
      const collection = mongoose.connection.db.collection('read_only__reports__project_notification_info');
      collection.updateOne(
        {
          _id: projectNotification['_id']
        },
        {
          $set: {
            name: projectNotification['name'],
            type: projectNotification['type'],
            subType: projectNotification['subType'],
            proponent: projectNotification['proponent'],
            trigger: projectNotification['trigger'],
            region: projectNotification['region'],
            decision: projectNotification['decision'],
            decisionDate: projectNotification['decisionDate'],
            associatedProjectName: projectNotification['associatedProjectName'],
            location: projectNotification['location'],
            centroid: projectNotification['centroid'],
            description: projectNotification['description'],
            notificationThresholdValue: projectNotification['notificationThresholdValue'],
            notificationThresholdUnits: projectNotification['notificationThresholdUnits'],
            notificationReceivedDate: projectNotification['notificationReceivedDate'],
            nature: projectNotification['nature']
          }
        },
        {
          upsert: true
        }
      );

      defaultLog.debug(`updated info for project notification '${projectNotification['name']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__project_notification_info');

    queryAggregates.push({ $out: 'read_only__reports__project_notification_info' });
    await mongoose.model('ProjectNotification').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__project_notification_info');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;
