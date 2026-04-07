'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');

    // "Enforcement" milestone item in list is "5cf00c03a266b7e1877504ef"

    p.updateOne({"type":"label", "_schemaName":"List", "name": "Enforcement"}, {$set: {"name": "Compliance & Enforcement"}})
    .then(q => {
        // Update the "Compliance" Documents to  point to "Enforcement" id
        p.updateMany({"_schemaName":"Document",  "milestone": "5cf00c03a266b7e1877504f0"},{$set: {"milestone": "5cf00c03a266b7e1877504ef"}});

        // Update "Inspection" Documents to  point to "Enforcement" id
        p.updateMany({"_schemaName":"Document",  "milestone": "5cf00c03a266b7e1877504ee"},{$set: {"milestone": "5cf00c03a266b7e1877504ef"}});
    })
    .then(function(x){
        // Delete the "Compliance", and "Inspection" milestones
        p.deleteOne({"_schemaName":"List", "name": "Compliance"});
        p.deleteOne({"_schemaName":"List", "name": "Inspection"});
    }).then( w =>{
    })
  },

  async down(db, client) {
    return null;
  }
};
