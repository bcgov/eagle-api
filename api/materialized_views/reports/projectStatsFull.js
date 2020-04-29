const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $lookup: {
        from: "epic",
        localField: "_id",
        foreignField: "project",
        as: "projectObjects"
      }
    },
    {
      $unwind: "$projectObjects"
    },
    {
      $project: {
        _schemaName: "$_schemaName",
        projectName: "$name",
        objectType: "$projectObjects._schemaName"
      }
    },
    {
      $group: {
        _id: {
          projectName: "$projectName",
          objectType: "$objectType"
        },
        count: {
          $sum: 1
        }
      }
    },
    {
      $project: {
        _projectName: "$_id.projectName",
        _objectType: "$_id.objectType",
        _count: "$count"
      }
    },
    {
      $project: {
        _id: false,
        projectName: "$_projectName",
        objectType: "$_objectType",
        count: "$_count"
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__project_stats_full');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__project_stats_full');

    const projects = await mongoose.model('Project').aggregate(queryAggregates);

    projects.forEach(project => {
      const collection = mongoose.connection.db.collection('read_only__reports__project_stats_full');
      collection.updateOne({
        'objectType': project['objectType'],
        'projectName': project['projectName']
      },
      {
        $set: { count: project['count'] },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for project '${project['objectType']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__project_stats_full');

    queryAggregates.push({ $out: 'read_only__reports__project_stats_full' });
    await mongoose.model('Project').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__project_stats_full');
    collection.createIndex({ count: 1 });
  }
}

exports.update = update;