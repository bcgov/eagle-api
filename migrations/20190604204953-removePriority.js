'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "RecentActivity" }
      }
    ])
      .toArray()
      .then(function (arr) {
        for (let item of arr) {
          p.update(
            {
              _id: item._id
            },
            {
              $unset: { priority: "" }
            });
        }
      });
  },

  async down(db, client) {
    return null;
  }
};
