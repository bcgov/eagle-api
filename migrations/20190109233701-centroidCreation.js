'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "Project"}
      },
      {
        $project: {
          _id: 1,
          lon: 1,
          lat: 1
        }
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
          $set: { centroid: [item.lon,item.lat] },
          $unset: { lon: "", lat: "" }
        });
      }
    });
  },

  async down(db, client) {
    return true;
  }
};
