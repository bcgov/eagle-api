'use strict';

let milestonesToUpdate = require(process.cwd() + '/migrations_data/lists/20200106221247-update-labels.js');
let milestonesToInsert = require(process.cwd() + '/migrations_data/lists/20200106221247-new-labels.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.aggregate([
      { $match: {_schemaName:"List", type: "label"} }
    ])
    .toArray()
    .then(function(arr) {
      for (let item of arr) {
        //Delete the time extension entries for 2018
        if (item.name === "Time Limit Extension" && item.legislation === 2018) {
          p.deleteOne({_id: item._id});
          continue;
        }
        const lookupMilestone = getListObject(milestonesToUpdate, item.name, item.legislation);
        if (lookupMilestone) {
          p.update(
            {
              _id: item._id
            },
            {
              $set: {
                listOrder: lookupMilestone.listOrder,
                name: lookupMilestone.name
              }
            }
          )
        }
      }
      p.insert(milestonesToInsert)
    })
    //Add in new milestone object
  },

  async down(db, client) {
    return null;
  }
};
