'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "CommentPeriod"}
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
          $addToSet: { read: { $each: [ "staff", "sysadmin" ] }, write: { $each: [ "staff", "sysadmin" ] } }
        });
      }
    });
  },

  async down(db, client) {
    return null;
  }
};
