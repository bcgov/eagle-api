'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.update(
      {
          _schemaName: "Document",
          $or: [
            {
              documentType: {
                $eq: ""
              }
            },
            {
              documentType: {
                $eq: null
              }
            }
          ]
      },
      {
        $set: { documentType: '' }
      },
      {
        multi: true
      }
    );
  },

  async down(db, client) {
    return null;
  }
};
