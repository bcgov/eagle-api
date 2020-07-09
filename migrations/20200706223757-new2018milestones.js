'use strict';

let dbm;
let type;
let seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = async function (db) {
  let mClient;
  try {
    mClient = await db.connection.connect(db.connectionString, { native_parser: true });
    const epic = mClient.collection('epic');

    // inject the new milestone/phase into the epic DB

    const newListValues = [{ 
      type: 'label',
      _schemaName: 'List',
      legislation: 2018,
      name: 'Transfer of Certificate/Order',
      listOrder: 26,
      read:['public','staff','sysadmin'],
      write:['staff','sysadmin']
    },
    {
      type: 'projectPhase',
      _schemaName: 'List',
      legislation: 2018,
      name: 'Post Decision - Transfer of Certificate/Order',
      listOrder: 19,
      read:['public','staff','sysadmin'],
      write:['staff','sysadmin']
    }];

    const result = await epic.insertMany(newListValues);
    console.log(`Process completed ${result.result.ok === 1 ? 'Successfully' : 'with errors'}. ${result.insertedCount} record(s) inserted.`);

    if (result.result.ok !== 1) {
      throw new Error(result);
    }

  } catch(err) {
    console.log('Error running new2018milestone migration: ' + err);
  }

  mClient.close();
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
