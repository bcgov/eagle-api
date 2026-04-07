'use strict';

let listItems = require(process.cwd() + '/migrations_data/lists/20190619151700-new-docTypes_labels.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');

    // Update List Items
    p.updateOne({"_schemaName":"List", "name": "PCP"}, {$set: {"name": "Comment Period"}});
    p.updateOne({"_schemaName":"List", "name": "Report/Study/Agreement"}, {$set: {"name": "Report / Study"}});
    p.updateOne({"_schemaName":"List", "name": "AIR Materials"}, {$set: {"name": "Application Information Requirements"}});
    p.updateOne({"_schemaName":"List", "name": "dAIR"}, {$set: {"name": "Draft Application Information Requirements"}});
    p.updateOne({"_schemaName":"List", "name": "AIR"}, {$set: {"name": "Application Information Requirements"}});
    p.updateOne({"_schemaName":"List", "name": "Proponent/Certificate Holder"}, {$set: {"name": "Proponent / Certificate Holder"}});

    p.deleteOne({"_schemaName":"List", "name": "Referral"});


    // Insert new list items

    p.insertMany(
      listItems
      )
      .then(function (arr) {
        console.log("arr:", arr)
      for(let item of arr.ops) {
        p.update(
        {
          _id: item._id
        },
        {
          $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
        });
      }
    });
  },

  async down(db, client) {
    return null;
  }
};
