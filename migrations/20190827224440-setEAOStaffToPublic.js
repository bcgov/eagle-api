'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "User" }
      }
    ])
      .toArray()
      .then(function (arr) {
        for (let item of arr) {
          if (item.orgName === 'Environmental Assessment Office')
            p.update(
              {
                _id: item._id
              },
              {
                $set: { read: ['staff', 'sysadmin', 'public'] }
              });
        }
      });
  },

  async down(db, client) {
    return null;
  }
};
