'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "User"}
      }
    ])
      .toArray()
      .then(function (arr) {
      for(let item of arr) {
        p.update(
        {
          _id: item._id
        },
        {
          $set: { read: ['staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
        });
      }
    });
  },

  async down(db, client) {
    return null;
  }
};
