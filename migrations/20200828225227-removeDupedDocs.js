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

    // remove duplicate invalid docs from Canada Line Rapid Transit project
    console.log('#######################################');
    console.log('##    Removing invalid empty docs    ##');
    console.log('#######################################');

    const result = await epic.deleteMany({ _schemaName: 'Document', internalName: 'executeETL.js' });
    
    console.log(`Process completed ${result.result.ok === 1 ? 'Successfully' : 'with errors'}. ${result.deletedCount} record(s) deleted.`);

    if (result.result.ok !== 1) {
      throw new Error(result);
    }

  } catch(err) {
    console.error(` ### Error clearing duplicate documents: ${err}`);
  }

  mClient.close();
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
