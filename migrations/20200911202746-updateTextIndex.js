'use strict';

module.exports = {
  async up(db, client) {
    let mClient;
    return db.connection.connect(db.connectionString, { native_parser: true})
      .then(async function(mClientInst, callback) {
        mClient = mClientInst;
        var epicCollection = db.collection('epic');
        // drop existing index, see dbFieldClean migration
        await dropProjectIndex(epicCollection)
        // apply index to capture embedded project data structure
        await applyCustomFullTextSearchIndex(epicCollection)
      })
  },

  async down(db, client) {
    return null;
  }
};
