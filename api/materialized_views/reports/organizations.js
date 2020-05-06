const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        _schemaName: 'Organization'
      }
    },
    {
      $project: {
        name: true,
        companyType: true,
        parentCompany: true,
        companyLegal: true,
        notes: '$description',
        address1: true,
        address2: true,
        city: true,
        province: true,
        postal: true,
        country: true,
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__organizations');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__organizations');

    const orgs = await mongoose.model('Organization').aggregate(queryAggregates);

    orgs.forEach(org => {
      const collection = mongoose.connection.db.collection('read_only__reports__organizations');
      collection.updateOne({
        '_id': org['_id'],
      },
      {
        $set: {
          name: org['name'],
          companyType: org['companyType'],
          parentCompany: org['parentCompany'],
          companyLegal: org['companyLegal'],
          notes: org['notes'],
          address1: org['address1'],
          address2: org['address2'],
          city: org['city'],
          province: org['province'],
          postal: org['postal'],
          country: org['country'],
        }
      },
      {
        upsert: true,
      });

      defaultLog.debug(`updated info for organization '${org['name']}'`);
    });
  } else {
    defaultLog.debug('initializing read_only__reports__organizations');

    queryAggregates.push({ $out: 'read_only__reports__organizations' });
    await mongoose.model('Organization').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__organizations');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;