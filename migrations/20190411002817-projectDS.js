'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "Project"}
      }
    ])
    .toArray()
    .then(function (arr) {
      for(let item of arr) {
        if (item._id !== '58850ff2aaecd9001b808bae') {
          p.update(
          {
            _id: item._id
          },
          {
            $unset: { directoryStructure: "", userCan: "" }
          });
        } else {
          // Fix for seven mile generating station.
          p.update(
          {
            _id: item._id
          },
          {
            $unset: { directoryStructure: "", userCan: "" },
            $set: { read: ['sysadmin', 'staff', 'public'],
                    write: ['sysadmin', 'staff'],
                    delete: ['sysadmin', 'staff'] }
          });
        }
      }
    });
  },

  async down(db, client) {
    return null;
  }
};
