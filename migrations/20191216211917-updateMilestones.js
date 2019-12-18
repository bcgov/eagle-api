'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

let migrationItems = require(process.cwd() + '/migrations_data/milestone_lists');

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true})
    .then((mClientInst) => {
      mClient = mClientInst;
      var p = mClient.collection('epic');
      p.aggregate([
        { $match: {_schemaName:"List", type: "label"} }
      ])
      .toArray()
      .then(function(arr) {
        for (let item of arr) {
          const milestoneName = item.name;
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
          p.insert(migrationItems.newMilestone)
          mClient.close();
      })
      //Add in new milestone object
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });
};
function getMilestoneListObject(milestoneName) {
  for (var i=0; i < migrationItems.milestoneList.length; i++) { 
    const milestoneItem = migrationItems.milestoneList[i];
    if (milestoneItem.name === milestoneName || milestoneItem.oldName && milestoneItem.oldName === milestoneName) {
      return milestoneItem;
    }
  }
}
exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
