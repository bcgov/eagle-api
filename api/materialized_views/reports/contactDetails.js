const mongoose = require('mongoose');

async function update(defaultLog) {
  const queryAggregates = [
    {
      $match: {
        _schemaName: 'User'
      }
    },
    {
      $project: {
        firstName: true,
        middleName: true,
        lastName: true,
        salutation: true,
        title: true,
        department: true,
        organization: '$orgName',
        phoneNumber: true,
        faxNumber: true,
        cellPhoneNumber: true,
        email: true,
        address1: true,
        address2: true,
        city: true,
        province: true,
        country: true,
        postalCode: true,
        notes: true
      }
    }
  ];

  const collection = mongoose.connection.db.collection('read_only__reports__contact_details');
  let result;
  if (collection) {
    result = await collection.find({}, { projection: { '_id': 1 } }).limit(1).toArray();
  }

  if (collection && result.length > 0) {
    defaultLog.debug('checking if need to update read_only__reports__contact_details');

    const users = await mongoose.model('User').aggregate(queryAggregates);

    const ops = users.map(user => ({
      updateOne: {
        filter: { _id: user['_id'] },
        update: {
          $set: {
            firstName: user['firstName'],
            middleName: user['middleName'],
            lastName: user['lastName'],
            salutation: user['salutation'],
            title: user['title'],
            department: user['department'],
            organization: user['organization'],
            phoneNumber: user['phoneNumber'],
            faxNumber: user['faxNumber'],
            cellPhoneNumber: user['cellPhoneNumber'],
            email: user['email'],
            address1: user['address1'],
            address2: user['address2'],
            city: user['city'],
            province: user['province'],
            country: user['country'],
            postalCode: user['postalCode'],
            notes: user['notes']
          }
        },
        upsert: true
      }
    }));
    if (ops.length) await collection.bulkWrite(ops, { ordered: false });
    defaultLog.debug(`bulkWrite ${ops.length} ops to read_only__reports__contact_details`);
  } else {
    defaultLog.debug('initializing read_only__reports__contact_details');

    queryAggregates.push({ $out: 'read_only__reports__contact_details' });
    await mongoose.model('User').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__contact_details');
    collection.createIndex({ _id: 1 });
  }
}

exports.update = update;