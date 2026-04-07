'use strict';

module.exports = {
  async up(db, client) {
      let p = db.collection('epic');

      const query = { _schemaName: 'Document', keywords: [] };
      const update = { $set: { keywords: '' } };
      const options = { "upsert": false };

      console.log('Setting all Documents with empty arrays to empty strings');

      p.updateMany(query, update, options)
      .then(result => {
        console.log('Completed successfully');
      })
      .catch(err => { 
        console.error(`Failed to update document resources: ${err}`); 
      });
    }).catch(err => {
      console.error(`Failed to update document resources: ${err}`); 
  },

  async down(db, client) {
  }
};
