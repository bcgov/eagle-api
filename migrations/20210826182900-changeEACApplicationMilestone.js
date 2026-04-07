'use strict';

module.exports = {
  async up(db, client) {
    console.log(`**** Changing 'Draft EAC Application' milestone tag to 'EAC Application' ****`);


    const epic = await db.collection('epic');

    try {

      await epic.updateOne(
        { name: 'Draft EAC Application' },
        { $set: { name: 'EAC Application' } }
      );

    } catch (err) {
      console.log(`ERROR: ${err}`);
    }

    console.log(`**** Finished changing 'Draft EAC Application' milestone tag to 'EAC Application' ****`);

    return null;
  },

  async down(db, client) {
    return null;
  }
};
