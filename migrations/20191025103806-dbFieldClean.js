'use strict';

/**
  * dbFieldClean
  *   - remove any non-modelled or non-intrinsic (eg _id) field from the database
  *   - put the database in a state that matches the existing models on leading to more effective development, reporting, maintenance
  */

const _ = require('lodash');

module.exports = {
  async up(db, client) {
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
  },

  async down(db, client) {
    return null;
  }
};
