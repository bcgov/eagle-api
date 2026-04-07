'use strict';

let listItems = require(process.cwd() + '/migrations_data/lists/20190404201820-new-authors_docTypes_labels_headlineTypes.js');

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
