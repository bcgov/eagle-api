'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
      p.update({"_schemaName":"Project", "region":  "thompson-nicola"},{$set: {"region": "Thompson-Nicola" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "cariboo"},{$set: {"region": "Cariboo" }},{multi: true});
      p.update({"_schemaName":"Project","region":  "kootenay"},{$set: {"region": "Kootenay" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "lower mainland"},{$set: {"region": "Lower Mainland" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "okanagan"},{$set: {"region": "Okanagan" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "omineca"},{$set: {"region": "Omineca" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "peace"},{$set: {"region": "Peace" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "skeena"},{$set: {"region": "Skeena" }},{multi: true});
      p.update({"_schemaName":"Project", "region":  "vancouver island"},{$set: {"region": "Vancouver Island" }},{multi: true});    
  },

  async down(db, client) {
    return null;
  }
};
