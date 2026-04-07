'use strict';

var options      = require('../config/mongoose_options').mongooseOptions;
const loadModels = require('../app_helper').loadModels;
const fs         = require('fs');

module.exports = {
  async up(db, client) {
    let p = db.collection('epic');

    const query = { _schemaName: 'Document'};
    const update = { $set: { sortOrder: 0 }};
    const options = { upsert: false };

    console.log('Adding sortOrder attribute to all document resources...');

    p.updateMany(query, update, options)
    .then(async result => {
      console.log('Completed successfully, Updating legacy documents...');
      await processData(p);
    })
    .catch(err => { 
      console.error(`Failed to update document resources: ${err}`); 
    });
  },

  async down(db, client) {
    return true;
  }
};
