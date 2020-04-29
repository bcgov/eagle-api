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
        name: "$default.name",
        centroid: "$default.centroid",
        legislation: "$default.legislation",
        location: "$default.location",
        region: "$default.region",
        sector: "$default.sector",
        shortName: "$default.shortName",
        status: "$default.status",
        type: "$default.type",
        projectLead: "$default.projectLead",
        projectLeadEmail: "$default.projectLeadEmail",
        projectLeadPhone: "$default.projectLeadPhone",
        responsibleEPD: "$default.responsibleEPD",
        responsibleEPDEmail: "$default.responsibleEPDEmail",
        responsibleEPDPhone: "$default.responsibleEPDPhone"
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__project_geo_info');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__project_geo_info');

    const projects = await mongoose.model('Project').aggregate(queryAggregates);

    projects.forEach(project => {
      const collection = mongoose.connection.db.collection('read_only__reports__project_geo_info');
      collection.updateOne({
        '_id': project['name'],
      },
      {
        $set: {
          centroid: project['centroid'],
          legislation: project['legislation'],
          location: project['location'],
          region: project['region'],
          sector: project['sector'],
          shortName: project['shortName'],
          status: project['status'],
          type: project['type'],
          projectLead: project['projectLead'],
          projectLeadEmail: project['projectLeadEmail'],
          projectLeadPhone: project['projectLeadPhone'],
          responsibleEPD: project['responsibleEPD'],
          responsibleEPDEmail: project['responsibleEPDEmail'],
          responsibleEPDPhone: project['responsibleEPDPhone'],
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for project '${project['name']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__project_geo_info');

    queryAggregates.push({ $out: 'read_only__reports__project_geo_info' });
    await mongoose.model('Project').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__project_geo_info');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;