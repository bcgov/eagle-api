'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.update(
      {
          _schemaName: "Organization",
      },
      {
        $set: { read: ['sysadmin', 'staff'] }
      }
    );
  },

  async down(db, client) {
    return null;
  }
};
