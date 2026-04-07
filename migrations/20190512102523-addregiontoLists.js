'use strict';

let listItems = require(process.cwd() + '/migrations_data/lists/20190512102523-new-regions.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.insertMany(
      listItems
      )
      .then(function (arr) {
        console.log("arr:", arr)
      for(let item of arr.ops) {
        p.update(
        {
          _id: item._id
        },
        {
          $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
        });
      }
    });
  },

  async down(db, client) {
    return null;
  }
};
