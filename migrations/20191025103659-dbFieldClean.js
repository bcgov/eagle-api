'use strict';

/**
  * dbFieldClean
  *   - remove any non-modelled or non-intrinsic (eg _id) field from the database
  *   - put the database in a state that matches the existing models on leading to more effective development, reporting, maintenance
  */

const mongoose = require('mongoose');
const _ = require('lodash');

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

async function createHotbackup(db, hotbackupName) {
  return new Promise(function(resolve, reject) {
    resolve(db.createCollection(hotbackupName));
  });
}

async function applySimpleIndexes(targetCollection, indexes) {
  return new Promise(function(resolve, reject) {
    Object.keys(indexes).forEach(function(key, index, arrayOfKeys) {
      let newIndex = {};
      for (let i=0; i < (indexes[key]).length; i++){
        let indexTuple = indexes[key][i];
        if ("text" == indexTuple[1]) {
          newIndex = {};
          break;
        }
        newIndex[indexTuple[0]] = indexTuple[1];
        console.log("applying simple index on field '" + indexTuple[0] + "'");
      }
      if (!_.isEmpty(newIndex)) resolve(targetCollection.createIndex(newIndex));
    });
    resolve();
  });
}

async function applyCustomFullTextSearchIndex(targetCollection) {
  return new Promise(function(resolve, reject) {
    console.log("applying multifield custom FTS index");
    resolve(targetCollection.createIndex( {
      displayName: "text",
      name: "text",
      description: "text",
      eacDecision: "text",
      location: "text",
      region: "text",
      commodity: "text",
      type: "text",
      epicProjectId: "text",
      sector: "text",
      status: "text",
      labels: "text",
      code: "text" },
      {
          weights: {
              name: 9000,
              displayName: 8500,
              description: 8000,
              milestone: 7000,
              headline: 1,
              content: 1,
              label: 6000,
              documentFileName: 5000,
              type: 4000,
              documentAuthor: 3000,
              datePosted: 2500,
              dateUploaded: 2000,
              orgName: 1
          },
          name: "searchIndex_1"
      }
    ));
  });
}

exports.up = function(db) {
  let mongoHandle;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(mongoInstance => {
      mongoHandle = mongoInstance;  // closable on err
      
      let hotbackupName = "epic-hotbackup_delete-one-month-from-" + new Date().toISOString().replace(/([^0-9]+)/gi, '');
      createHotbackup(db, hotbackupName).then(async function() {
        console.log(hotbackupName);
        let epic = mongoHandle.collection("epic");
        let hotbackup = mongoHandle.collection(hotbackupName);

        await epic.aggregate([{ $match: {} }])
        .toArray()
        .then(function (arr) {
          console.log("number of collection documents in epic:", arr.length);
          let i = 0;
          for (let item of arr) {
            console.log((++i) + " of " + arr.length);
            hotbackup.insert(item);
            if (9 < i) break; // uncomment for debugging sanity
          }

        });
        let indexes = await epic.indexInformation();
        //console.log(indexes);
        await applySimpleIndexes(hotbackup, indexes);
        await applyCustomFullTextSearchIndex(hotbackup);
      }).then(async function() {
        let epic = mongoHandle.collection("epic");
        var models = Object.keys(mongoose.models);
        for (var i=0; i < models.length; i++) {
          console.log(models[i]);
        }
        // Object.keys(mongoose.models).forEach(function(model) {
        //   console.log(model);
        // });
        mongoHandle.close();
      });
    })
    .catch((e) => {
      console.log("e:", e);
      mongoHandle.close();
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
