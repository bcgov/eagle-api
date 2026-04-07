'use strict';

let item = {
    "type" : "projectPhase",
    "_schemaName" : "List",
    "name" : "Other"
};

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.insertOne(item)
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
