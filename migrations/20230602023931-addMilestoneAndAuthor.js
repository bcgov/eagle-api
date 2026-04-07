'use strict';

let items = [
  {
  "type" : "author",
  "_schemaName" : "List",
  "legislation": 2018,
  "name" : "Dispute Resolution Facilitator"
  },
  {
    "type" : "label",
    "_schemaName" : "List",
    "legislation": 2018,
    "name" : "Dispute Resolution"
  }
];

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.insertMany(items)
      .then(function (arr) {
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
