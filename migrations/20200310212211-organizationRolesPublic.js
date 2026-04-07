'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.updateMany(
      {
          _schemaName: "Organization",
      },
      {
        $set: { read: ['public', 'sysadmin', 'staff'] }
      }
    );
  },

  async down(db, client) {
    return null;
  }
};
