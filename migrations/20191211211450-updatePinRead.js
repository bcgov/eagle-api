'use strict';

var dbm;
var type;
var seed;
const mongoose = require('mongoose');


/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
}

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {

      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');

      // get all projects
      p.aggregate([
        {
          $match: { _schemaName: "Project" }
        }
      ])
        .toArray()
        .then(function (arr) {
          for (let item of arr) {
            // change the schema name from project to projectData
            let projectId = item._id

            // set pins back to an empty array
            let pins = [];
            p.update(
              {
                _id: projectId
              },
              {
                $set: {
                  pins: pins,
                  pinsRead: ["sysadmin", "staff"],
                }
              }
            );
          }
          mClient.close();
        });
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });}

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
