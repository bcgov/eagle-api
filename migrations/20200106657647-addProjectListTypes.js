'use strict';

const listItems = require(process.cwd() + '/migrations_data/lists/20200106221500-new-ceaaInvolvments_eaDecisions.js');

module.exports = {
  async up(db, client) {
    let mClient;
    return db.connection.connect(db.connectionString, { native_parser: true })
      .then((client) => {
        mClient = client;

        const collection = db.collection('epic');
        // Insert new list items
        collection.insertMany(
          listItems
          )
          .then(function (arr) {
            console.log("arr:", arr)
            for(let item of arr.ops) {
              collection.update(
              {
                _id: item._id
              },
              {
                $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
              });
            }
        });
      })
      .catch((e) => {
        console.log("e:", e);
      });
  },

  async down(db, client) {
    return null;
  }
};
