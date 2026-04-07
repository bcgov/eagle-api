'use strict';

module.exports = {
  async up(db, client) {
    try {
      const epic = db.collection('epic');

      // remove duplicate invalid docs from Canada Line Rapid Transit project
      console.log('#######################################');
      console.log('##    Removing invalid empty docs    ##');
      console.log('#######################################');

      const result = await epic.deleteMany({ _schemaName: 'Document', internalName: 'executeETL.js' });

      console.log(`Process completed ${result.result.ok === 1 ? 'Successfully' : 'with errors'}. ${result.deletedCount} record(s) deleted.`);

      if (result.result.ok !== 1) {
        throw new Error(result);
      }

    } catch(err) {
      console.error(` ### Error clearing duplicate documents: ${err}`);
    }
  },

  async down(db, client) {
    return null;
  }
};
