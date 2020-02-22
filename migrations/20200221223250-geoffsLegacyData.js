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

    const query = { _schemaName: 'Document'};
    const update = { $set: { sortOrder: 0 }};
    const options = { upsert: false };

    console.log('Adding sortOrder attribute to all document resources...');

    let updateManyResult = await p.updateMany(query, update, options)
    .then(async result => {
      console.log('Completed successfully, Updating legacy documents...');
      return await processData(p);
    })
    .catch(err => { 
      console.error(`Failed to update document resources: ${err}`); 
      mClient.close() 
    });
  });
};

exports.down = function(db) {
  return true;
};

exports._meta = {
  "version": 1
};

async function processData(p) {

  const legacyDocuments = JSON.parse(fs.readFileSync(process.cwd() + '/migrations_data/epic_legacy_data.json', 'utf8'));
  const invalidDate = new Date(1901, 12, 31, 23, 59, 59);

  console.log('Attempting to update ' + legacyDocuments.length + ' documents. This will take a while...');

  let successCount = 0;
  let notFoundCount = 0;
  let failCount = 0;
  let documentCount = 0;

  legacyDocuments.forEach(async (legacyDocument, index, array) => {
    
    if (legacyDocument.DOC_PTR != null && legacyDocument.DOC_PTR.length > 0) {

      let document = await mongoose.model('Document').findOne({ internalOriginalName: legacyDocument.DOC_PTR });

      if (document) {
        // set the sort order to match the section number
        document.sortOrder = legacyDocument.SECTION_NUMBER;
        // if dateUploaded is null, set it
        if(document.dateUploaded === null || document.dateUploaded === '') {
          document.dateUploaded = legacyDocument.DATE_RECEIVED;
        }
        // if datePosted is null or less than 1901, set it
        if(document.datePosted === null || document.datePosted === '' || document.datePosted < invalidDate) {
          document.datePosted = legacyDocument.DATE_POSTED;
        }

        let updatedDoc = await document.save()
        .then(doc => {
          successCount++;
        })
        .catch(err => { 
          failCount++;
          console.error('Failed to update document ' + document._id + ': ' + err); 
        });
      } else {
        notFoundCount++;
      }

      /*
      // doing multiple queries with update may be slightly faster
      // but we won't be able to get any stats
      const query = { 
                      _schemaName: 'Document', 
                      internalOriginalName: legacyDocument.DOC_PTR, 
                      $or: [ { dateUploaded: null }, { datePosted: { $lt: ISODate('1901-12-31T00:00:00Z') } } ] 
                    };
      const update = { $set: { sortOrder:      legacyDocument.SECTION_NUMBER, 
                               datePosted:     legacyDocument.DATE_POSTED, 
                               dateUploaded:   legacyDocument.DATE_RECEIVED }};
      const options = { upsert: false };

      p.update(query, update, options)
      .then(result => {
        // we probably don't want to log out this much...
        // console.log('Completed successfully');
      })
      .catch(err => { 
        console.error('Failed to update document ' + legacyDOcument.DOC_PTR + ': ' + ${err}); 
      });
      */
    } else {
      notFoundCount++;
    }

    documentCount++;
    if(documentCount === array.length) 
    {
      console.log('Migration complete. ' + successCount + ' successful updates and ' + failCount + ' failures, and ' + notFoundCount + ' were not found.');
      return true;
    }
  });
}