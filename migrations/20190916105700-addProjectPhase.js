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

let item = {
    "type" : "projectPhase",
    "_schemaName" : "List",
    "name" : "Other"
};

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {
      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');
      p.insertOne(item)
        .then(function (arr) {
        for(let item of arr.ops) {
          p.update(
          {
            _id: item._id
          },
          {
            $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
          });
        }
        mClient.close();
      });
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
