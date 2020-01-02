'use strict';

var dbm;
var type;
var seed;
var mongoose = require('mongoose');
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
      p.insert(migrationItems.newMilestones)
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
          const lookupMilestone = getListObject(migrationItems.milestoneList, item.name, item.legislation);
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
          mClient.close();
      })
      //Add in new milestone object
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });
};
function getListObject(list, name, legislation) {
  for (var i=0; i < list.length; i++) { 
    const listItem = list[i];
    //Logic to check legislation match and name or oldname match
    const legislationCheck = legislation === listItem.legislation;
    const newNameCheck = listItem.name.trim() === name.trim() && legislationCheck
    const oldNameCheck = listItem.oldName && listItem.oldName.trim() === name.trim() && legislationCheck

    if (newNameCheck || oldNameCheck) {
      return listItem;
    }
  }
}
exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
