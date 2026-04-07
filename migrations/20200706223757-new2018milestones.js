'use strict';

module.exports = {
  async up(db, client) {
    try {
      const epic = db.collection('epic');

      // inject the new milestone/phase into the epic DB

      const newListValues = [{ 
        type: 'label',
        _schemaName: 'List',
        legislation: 2018,
        name: 'Transfer of Certificate/Order',
        listOrder: 26,
        read:['public','staff','sysadmin'],
        write:['staff','sysadmin']
      },
      {
        type: 'projectPhase',
        _schemaName: 'List',
        legislation: 2018,
        name: 'Post Decision - Transfer of Certificate/Order',
        listOrder: 19,
        read:['public','staff','sysadmin'],
        write:['staff','sysadmin']
      }];

      const result = await epic.insertMany(newListValues);
      console.log(`Process completed ${result.result.ok === 1 ? 'Successfully' : 'with errors'}. ${result.insertedCount} record(s) inserted.`);

      if (result.result.ok !== 1) {
        throw new Error(result);
      }

    } catch(err) {
      console.log('Error running new2018milestone migration: ' + err);
    }
  },

  async down(db, client) {
    return null;
  }
};
