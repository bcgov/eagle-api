'use strict';

var dbm;
var type;
var seed;
var mongoose = require('mongoose');

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

let listItems = require(process.cwd() + '/migrations_data/ear_lists');

exports.up = function(db) {
  // create 2018 lists
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true})
    .then((mClientInst) => {
      mClient = mClientInst;
      var p = mClient.collection('epic');
      console.log("Setting current lists to 2002 legislation")
      p.updateMany(
        {
          _schemaName: "List", type: "author"
        },
        {
          $set: { legislation: 2002 }
        }
      ).catch((e) => {
        console.log("error: ", e);
      });

      p.updateMany(
        {
          _schemaName: "List", type: "doctype"
        },
        {
          $set: { legislation: 2002 }
        }
      ).catch((e) => {
        console.log("error: ", e);
      });

      p.updateMany(
        {
          _schemaName: "List", type: "projectPhase"
        },
        {
          $set: { legislation: 2002 }
        }
      ).catch((e) => {
        console.log("error: ", e);
      });

      p.updateMany(
        {
          _schemaName: "List", type: "label"
        },
        {
          $set: { legislation: 2002 }
        }
      ).catch((e) => {
        console.log("error: ", e);
      });

      // insert new lists
      console.log("Inserting 2018 list updates")
      p.insertMany(listItems)
        .then(function (arr) {
          for(let item of arr.ops) {
            p.update(
              {
                _id: item._id
              },
              {
                $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
              }
            );
          }
          mClient.close()
        })
        .catch((e) => {
          console.log("err: ", e)
          mClient.close()
        });
    })
    .catch((e) => {
      console.log("error: ", e);
      mClient.close()
    });

};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
