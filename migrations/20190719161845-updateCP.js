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

 let listItems = require(process.cwd() + '/migrations_data/comments_period_new_field.js');

 exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {
      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');
        // my code .......................
                for (let listItem of listItems){
                    p.updateOne({_id : mongoose.Types.ObjectId(listItem._id)},{$set: {informationForComment : listItem.informationForComment , description: listItem.description}})
                }
      // my code .........................
      mClient.close();
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });
};

 exports.down = function(db) {
  return null;
};

 exports._meta = {
  "version": 1
};