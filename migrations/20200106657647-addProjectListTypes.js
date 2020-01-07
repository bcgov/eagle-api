'use strict';

let dbm;
let type;
let seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

const listItems = require(process.cwd() + '/migrations_data/eaDecisionsAndIAACInvolvment');

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClient) => {
      const collection = mClient.collection('epic');
console.log(listItems);
      // Insert new list items
      collection.insertMany(
        listItems
        )
        .then(function (arr) {
          console.log("arr:", arr)
          for(let item of arr.ops) {
            collection.update(
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
