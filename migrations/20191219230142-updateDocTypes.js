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

let listItems = require(process.cwd() + '/migrations_data/updatedDocTypes.js');

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true})
    .then((mClientInst) => {
      mClient = mClientInst;
      var p = mClient.collection('epic');
      //Add in new objects
      p.insert(listItems.newDocList)
      p.aggregate([
        { $match: {_schemaName:"List", type: "doctype"} }
      ])
      .toArray()
      .then(function(arr) {
        for (let item of arr) {
          const doctypeName = item.name;
          const legislation = item.legislation;
          const lookupList = getListObject(listItems.docList, doctypeName, legislation);
          if (lookupList) {
            p.update(
              {
                _id: item._id
              },
              {
                $set: {
                  name: lookupList.name,
                  listOrder: lookupList.listOrder
                }
              }
            )
          }
          }
          mClient.close();
      })
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
