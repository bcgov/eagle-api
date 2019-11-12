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

exports.up = function(db) {
  let mongoHandle;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(mongoInstance => {
      mongoHandle = mongoInstance;  // expose for err disposal
      let epic = mongoHandle.collection("epic");
      let hotbackupName = "epic-hotbackup-with-legacy-fields-" + new Date().toISOString().replace(/([^0-9]+)/gi, '');
      
      performHotbackup(db, mongoHandle, hotbackupName, epic)
      .then(async () => {
        await removeLegacyFields(db.connectionString, epic);
      })
      .then(() => {
        console.log("Done");
        mongoHandle.close();
        process.exit(0)
      });
    })
    .catch((e) => {
      console.log("e:", e);
      mongoHandle.close();
      process.exit(0)
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};


async function performHotbackup(db, mongoHandle, hotbackupName, sourceCollection) {
  return new Promise(function(resolve, reject) { 
    createHotbackupCollection(db, hotbackupName).then(async () => {
      console.log(hotbackupName);
    
      let hotbackup = mongoHandle.collection(hotbackupName);
      await performHotbackupDataCopy(sourceCollection, hotbackup);
      
      let indexes = await sourceCollection.indexInformation();
      //console.log(indexes);
      await applySimpleIndexes(hotbackup, indexes);
      await applyCustomFullTextSearchIndex(hotbackup);
      resolve();
    });
  });
};

async function createHotbackupCollection(db, hotbackupName) {
  return new Promise(function(resolve, reject) {
    resolve(db.createCollection(hotbackupName));
  });
};

async function performHotbackupDataCopy(sourceCollection, destCollection) {
  return new Promise(function(resolve, reject) {
    resolve(sourceCollection.aggregate([{ $match: {} }])
    .toArray()
    .then(function (arr) {
      console.log("number of collection documents in " + sourceCollection.s.name + ":", arr.length);
      let i = 0;
      for (let item of arr) {
        console.log("Backing up " + sourceCollection.s.name + " " + (++i) + " of " + arr.length);
        destCollection.insert(item);
        // if (9 < i) break; // uncomment for debugging sanity
      }
    }));
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
};

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
};

async function removeLegacyFields(dbConnectionString, collectionToDeleteFrom) {
  let dbSchemaFieldsToDelete = await getLegacyDbSchemaFields(dbConnectionString, collectionToDeleteFrom);
  
  console.log("Legacy fields in DB not used by the models:");
  console.log(dbSchemaFieldsToDelete);
  
  let somethingToDelete = false;
  let schemasToCheck = Object.keys(dbSchemaFieldsToDelete);
  for (var i=0; i < schemasToCheck.length; i++) {
    let schemaName = schemasToCheck[i];
    somethingToDelete = (0 < (dbSchemaFieldsToDelete[schemaName]).length);
    if (somethingToDelete) break;
  }

  if (somethingToDelete) {
    console.log("Deleting legacy fields from DB...");
    await deleteLegacyFieldsFromDb(collectionToDeleteFrom, dbSchemaFieldsToDelete);
    return;
  }
  console.log("The database schemas and mongoose models appear to be in sync");
  console.log("Nothing to do here");
}

async function getModelFields() {
  return new Promise(function(resolve, reject) {
    // console.log(mongoose.models);
    let modelFields = {};
    let modelNames = Object.keys(mongoose.models);
    for (var i=0; i < modelNames.length; i++) {
      let modelName = modelNames[i];
      // console.log(modelName);
      // console.log(mongoose.models[modelName].schema.obj);
      let fieldNames = Object.keys(mongoose.models[modelName].schema.obj);
      // for(let j=0; j < fieldNames.length; j++) console.log(modelName + "." + fieldNames[j]);
      modelFields[modelName] = fieldNames;
    }
    resolve(modelFields);
  });
}

async function getModelFieldsFromMongooseOnRunningApp(dbConnectionString) {
  // the running app will populate mongoose
  return new Promise(function(resolve, reject) {
    if (_.isEmpty(Object.keys(mongoose.models))) {
      var options = require('../config/mongoose_options').mongooseOptions;
      const loadModels = require('../app_helper').loadModels;
      const defaultLog = null;
      loadModels(dbConnectionString, options, defaultLog).then(function() {
        resolve(getModelFields());
      });
    } else {
      resolve(getModelFields());
    }
  });
}


async function getDbSchemas(collection) {
  return new Promise(function(resolve, reject) {
    collection.distinct("_schemaName").then(schemaNames => {
      resolve(schemaNames);
    });
  });
}

async function getDbSchemaFields(collection) {
  return new Promise(function(resolve, reject) {
    getDbSchemas(collection).then(async schemaNames => {
      let dbSchemaFields = {};
      for (var i=0; i < schemaNames.length; i++) {
        let schemaName = schemaNames[i];
        // console.log(schemaName);
        await collection.aggregate([
          {
            $match: { 
              "_schemaName": schemaName
            }
          }
          ,{
            $project: {
              "array_of_key_values": { 
                $objectToArray : "$$ROOT" 
              }
            }
          }
          ,{ 
            $unwind: "$array_of_key_values"
          }
          ,{ 
            $group: {
              "_id": null,
              "allkeys": {
                $addToSet: "$array_of_key_values.k"
              }
            }
          }
        ])
        .toArray()
        .then(function (arr) {
          if (1 != arr.length) throw("DB field lookup error");
          dbSchemaFields[schemaName] = arr[0].allkeys;
        });
      }
      resolve(dbSchemaFields);
    });
  });
}

async function getLegacyDbSchemaFields(dbConnectionString, collection){
  return new Promise(function(resolve, reject) {
    getModelFieldsFromMongooseOnRunningApp(dbConnectionString).then(modelFields => {
      // console.log(modelFields);
      getDbSchemaFields(collection).then(dbSchemaFields => {
        // console.log(dbSchemaFields);
        let dbSchemaFieldsToDelete = {};
        let dbSchemaFieldKeys = Object.keys(dbSchemaFields);
        for (let i = 0; i < dbSchemaFieldKeys.length; i++) {
          let schema = dbSchemaFieldKeys[i];
          let schemaFieldArr = dbSchemaFields[schema];
          // console.log("schemaFieldArr", schemaFieldArr);
          let modelFieldArr = modelFields[schema];
          // console.log("modelFieldArr", modelFieldArr);
          let fieldsToDelete = [];
          for (let j = 0; j < schemaFieldArr.length; j++) {
            // ignore special cases and permutations of the whitelist
            if (("_id" == schemaFieldArr[j]) 
            || ("__v" == schemaFieldArr[j])
            || (modelFieldArr.includes(schemaFieldArr[j]))
            || (modelFieldArr.includes("_" + schemaFieldArr[j]))) continue;
            fieldsToDelete.push(schemaFieldArr[j]);
          }
          dbSchemaFieldsToDelete[schema] = fieldsToDelete;
        }
        resolve(dbSchemaFieldsToDelete);
      });
    });
  });
}

async function deleteLegacyFieldsFromDb(collection, dbSchemaFieldsToDelete) {
  return new Promise(function(resolve, reject) {
    let dbSchemaFieldKeys = Object.keys(dbSchemaFieldsToDelete);
    let deletionPromises = [];
    for (let i = 0; i < dbSchemaFieldKeys.length; i++) {
      let schema = dbSchemaFieldKeys[i];
      let schemaFieldToDeleteArr = dbSchemaFieldsToDelete[schema];
      let project = {};
      for (let j = 0; j < schemaFieldToDeleteArr.length; j++) {
        let field = schemaFieldToDeleteArr[j];
        project[field] = 1;
      }
      if (_.isEmpty(project)) continue;
      // console.log(project);
      let projectPlusId = JSON.parse(JSON.stringify(project));
      projectPlusId["_id"] = 1;
      deletionPromises.push(collection.aggregate([
        {
          $match: { _schemaName: schema }
        },
        {
          $project: projectPlusId
        }
      ])
      .toArray()
      .then(function (arr) {
        // console.log("arr.length", arr.length);
        for(let item of arr) {
          collection.update(
            {
              _id: item._id
            },
            {
              $unset: project
            }
          );
        }
      }));
    }
    resolve(Promise.all(deletionPromises));
  });
}

