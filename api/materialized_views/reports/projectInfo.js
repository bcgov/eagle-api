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
      $lookup: {
        from: 'epic',
        localField: 'default.proponent',
        foreignField: '_id',
        as: 'default.proponent'
      }
    },
    {
      $unwind: {
        path: '$default.proponent',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'epic',
        localField: 'default.currentPhaseName',
        foreignField: '_id',
        as: 'default.currentPhaseName'
      }
    },
    {
      $unwind: {
        path: '$default.currentPhaseName',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'epic',
        localField: 'default.CEAAInvolvement',
        foreignField: '_id',
        as: 'default.CEAAInvolvement'
      }
    },
    {
      $unwind: {
        path: '$default.CEAAInvolvement',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'epic',
        localField: 'default.eacDecision',
        foreignField: '_id',
        as: 'default.eacDecision'
      }
    },
    {
      $unwind: {
        path: '$default.eacDecision',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        name: '$default.name',
        centroid: '$default.centroid',
        legislation: '$default.legislation',
        location: '$default.location',
        region: '$default.region',
        sector: '$default.sector',
        shortName: '$default.shortName',
        status: '$default.status',
        type: '$default.type',
        projectLead: '$default.projectLead',
        projectLeadEmail: '$default.projectLeadEmail',
        projectLeadPhone: '$default.projectLeadPhone',
        responsibleEPD: '$default.responsibleEPD',
        responsibleEPDEmail: '$default.responsibleEPDEmail',
        responsibleEPDPhone: '$default.responsibleEPDPhone',
        nature: '$default.build',
        subType: '$default.sector',
        currentPhaseName: '$default.currentPhaseName.name',
        proponent: '$default.proponent.name',
        IAACInvolvement: '$default.CEAAInvolvement.name',
        IAACUrl: '$default.CEAALink',
        description: '$default.description',
        capitalInvestment: '$default.intake.investment',
        notes: '$default.intake.investmentNotes',
        eaDecisionDate: '$default.decisionDate',
        eaDecision: '$default.eacDecision.name',
        readinessDecision: '$default.eaStatus',
        readinessDecisionDate: '$default.eaStatusDate',
        substantially: '$default.substantially',
        substantiallyDate: '$default.substantiallyDate',
        disputeResolution: '$default.dispute',
        disputeDate: '$default.disputeDate',
        read: '$read'
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__project_info');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__project_info');

    const projects = await mongoose.model('Project').aggregate(queryAggregates);

    projects.forEach(project => {
      const collection = mongoose.connection.db.collection('read_only__reports__project_info');
      collection.updateOne({
        '_id': project['_id'],
      },
      {
        $set: {
          name: project['name'],
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
          nature: project['nature'],
          subType: project['sector'],
          currentPhaseName: project['currentPhaseName'],
          proponent: project['proponent'],
          IAACInvolvement: project['IAACInvolvement'],
          IAACUrl: project['IAACUrl'],
          description: project['description'],
          capitalInvestment: project['capitalInvestment'],
          notes: project['notes'],
          eaDecisionDate: project['eaDecisionDate'],
          eaDecision: project['eaDecision'],
          substantially: project['substantially'],
          substantiallyDate: project['substantiallyDate'],
          disputeResolution: project['disputeResolution'] ? 'Yes' : 'No',
          disputeDate: project['disputeDate'],
          readinessDecision: project['eaStatus'],
          readinessDecisionDate: project['readinessDecisionDate'],
          published: project['read'].includes('public')
        },
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for project '${project['name']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__project_info');

    queryAggregates.push({ $out: 'read_only__reports__project_info' });
    await mongoose.model('Project').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__project_info');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;