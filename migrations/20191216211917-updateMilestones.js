'use strict';


let milestonesToUpdate = require(process.cwd() + '/migrations_data/lists/20191216211917-update-labels.js');
let milestonesToInsert = require(process.cwd() + '/migrations_data/lists/20191216211917-new-labels.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.insert(milestonesToInsert)
    //Delete Revised Assessment Repo
    p.aggregate([
      { $match: {_schemaName:"List", type: "label"} }
    ])
    .toArray()
    .then(function(arr) {
      for (let item of arr) {
        const milestoneName = item.name;
        if (milestoneName === "Revised Assessment Report") {
          //Delete this entry
          p.deleteOne({_id: item._id});
        }
        const lookupMilestone = getMilestoneListObject(milestoneName);
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
    })
    //Add in new milestone object
  },

  async down(db, client) {
    return null;
  }
};
