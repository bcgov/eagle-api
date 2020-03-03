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
}

let milestonesToUpdate = require(process.cwd() + '/migrations_data/lists/20200106221247-update-labels.js');
let milestonesToInsert = require(process.cwd() + '/migrations_data/lists/20200106221247-new-labels.js');
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
