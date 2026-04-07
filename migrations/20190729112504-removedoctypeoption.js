'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');

    // "Enforcement Action" milestone item in list is "5cf00c03a266b7e1877504d8"
    p.updateMany({_schemaName:"Document","type":mongoose.Types.ObjectId("5cf00c03a266b7e1877504d8")}, {$unset: {"type": ""}})
    .then(
    p.deleteOne({_schemaName:"List", "name":"Enforcement Action"})
    )
    .then(
    )
  },

  async down(db, client) {
    return null;
  }
};
