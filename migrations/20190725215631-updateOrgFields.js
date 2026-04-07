'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      {
        $match: { _schemaName: "Organization" }
      }
    ])
      .toArray()
      .then(function (arr) {
        for (let item of arr) {
          if (item.companyType === 'Proponent') {
            p.update(
              {
                _id: item._id
              },
              {
                $set: { companyType: 'Proponent/Certificate Holder' }
              });
          }
          else if (item.companyType === 'Aboriginal Group') {
            p.update(
              {
                _id: item._id
              },
              {
                $set: { companyType: 'Indigenous Group' }
              });
          }
        }
      });
  },

  async down(db, client) {
    return null;
  }
};
