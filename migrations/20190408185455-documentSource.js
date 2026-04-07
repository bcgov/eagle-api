'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.update(
      {
        _schemaName: "Document",
        $or: [
          {
            documentSource: {
              $eq: ""
            }
          },
          {
            documentSource: {
              $eq: null
            }
          }
        ]
      },
      {
        $set: { documentSource: 'PROJECT' }
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
