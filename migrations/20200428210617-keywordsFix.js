'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
  let mClient;

  return db.connection.connect(db.connectionString, { native_parser: true })
  .then((mClientInst) => 
  {
    // mClientInst is an instance of MongoClient
    mClient = mClientInst;
    let p = mClient.collection('epic');

    const query = { _schemaName: 'Document', keywords: [] };
    const update = { $set: { keywords: '' } };
    const options = { "upsert": false };

    console.log('Setting all Documents with empty arrays to empty strings');

    p.updateMany(query, update, options)
    .then(result => {
      console.log('Completed successfully');
      mClient.close() 
    })
    .catch(err => { 
      console.error(`Failed to update document resources: ${err}`); 
      mClient.close() 
    });
  }).catch(err => {
    console.error(`Failed to update document resources: ${err}`); 
    mClient.close() 
  });
};

exports.down = function(db) { return true; };
exports._meta = { 'version': 1 };
