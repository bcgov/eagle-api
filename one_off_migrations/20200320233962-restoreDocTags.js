'use strict';

const mongoose   = require('mongoose');
var options      = require('../config/mongoose_options').mongooseOptions;
const loadModels = require('../app_helper').loadModels;
const fs         = require('fs');

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

exports.up = async function(db) {

  const models = await loadModels(db.connectionString, options, null);

  return db.connection.connect(db.connectionString, { native_parser: true })
  .then(async (mClient) =>
  {
    let p = mClient.collection('epic');

    let successCount = 0;
    let notFoundCount = 0;
    let failCount = 0;
    let documentCount = 0;

    const lostDocuments = await JSON.parse(fs.readFileSync(process.cwd() + '/migrations_data/lostDocuments19032020.json', 'utf8'));
    await lostDocuments.forEach (async (lostDocument, index, array) => {
      let newDocument = await mongoose.model('Document').findOne({ _id: lostDocument._id.$oid});
      // update the tags
      if (newDocument){

        newDocument.documentFileName = lostDocument.documentFileName;
        newDocument.datePosted = lostDocument.datePosted.$date;
        newDocument.description = lostDocument.description;
        newDocument.displayName = lostDocument.displayName;
        newDocument.documentAuthorType = lostDocument.documentAuthorType.$oid;
        newDocument.milestone = lostDocument.milestone.$oid;
        newDocument.projectPhase = lostDocument.projectPhase.$oid;
        newDocument.type = lostDocument.type.$oid;
        newDocument.legislation = lostDocument.legislation;

        // fixes one off error on schema match
        if (newDocument.keywords == []){
          newDocument.keywords = '';
        }

        await newDocument.save()
        .then(doc => {
          successCount++;
        })
        .catch(err => {
          failCount++;
          console.error('Failed to update document ' + newDocument._id + ': ' + err);
        });
      }else{
        notFoundCount++;
      }
      documentCount++;
      if(documentCount === array.length)
      {
        console.log('Migration complete. ' + successCount + ' successful updates and ' + failCount + ' failures, and ' + notFoundCount + ' were not found.');
        return true;
      }
    });
    mClient.close()
  });
};

exports.down = function(db) {
  return true;
};

exports._meta = {
  "version": 1
};