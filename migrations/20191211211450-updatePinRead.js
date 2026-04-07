'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');

    // get all projects
    p.aggregate([
      {
        $match: { _schemaName: "Project" }
      }
    ])
      .toArray()
      .then(function (arr) {
        for (let item of arr) {
          // change the schema name from project to projectData
          let projectId = item._id

          // set pins back to an empty array
          let pins = [];
          p.update(
            {
              _id: projectId
            },
            {
              $set: {
                pins: pins,
                pinsRead: ["sysadmin", "staff"],
              }
            }
          );
        }
      });
  },

  async down(db, client) {
    return null;
  }
};
