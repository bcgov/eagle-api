'use strict';

module.exports = {
  async up(db, client) {
    let p = db.collection('epic');

    const query = { _schemaName: 'RecentActivity'};
    const update = { $set: { notificationName: '' }};
    const options = { "upsert": false };

    console.log('Adding notificationName attribute to all recent Activities...');

    p.updateMany(query, update, options)
    .then(result => {
      console.log('Completed successfully');
      return result
    })
    .catch(err => { 
      console.error(`Failed to update Recent Activities: ${err}`); 
    });
  },

  async down(db, client) {
    return null;
  }
};
