'use strict';

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function () {
};

exports.up = async function (db) {

  console.log(`**** Changing 'Draft EAC Application' milestone tag to 'EAC Application' ****`);

  const mClient = await db.connection.connect(db.connectionString, {
    native_parser: true
  });

  const epic = await mClient.collection('epic');

  try {

    await epic.updateOne(
      { name: 'Draft EAC Application' },
      { $set: { name: 'EAC Application' } }
    );

  } catch (err) {
    console.log(`ERROR: ${err}`);
  }

  console.log(`**** Finished changing 'Draft EAC Application' milestone tag to 'EAC Application' ****`);
  mClient.close();

  return null;
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
