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

let newItem = {
  "type" : "projectPhase",
  "_schemaName" : "List",
  "name" : "Project Designation",
  "legislation" : 2018,
  "read" : [
		"public",
		"staff",
		"sysadmin"
	],
	"write" : [
		"staff",
		"sysadmin"
  ],
  "listOrder" : 0
};

let docList_order_2018 = [1,2,3,4,5,6,14,7,8,9,10,11,16,12,13,15,17,0];
let docList_order_2002 = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];

exports.up = function(db) {
    let mClient;
    return db.connection.connect(db.connectionString, { native_parser: true })
      .then((mClientInst) => {
        // mClientInst is an instance of MongoClient
        mClient = mClientInst;
        var p = mClient.collection('epic');
        
        p.updateOne({"_schemaName":"List", "legislation": 2018, "name": "EA Readiness Decision"}, {$set: {"name": "Readiness Decision"}});
        p.updateOne({"_schemaName":"List", "legislation": 2018, "name": "Application Development & Review"}, {$set: {"name": "Application Development and Review"}});
        p.updateOne({"_schemaName":"List", "legislation": 2018, "name": "Post Decision"}, {$set: {"name": "Post Decision - Extension"}});

        p.insertOne(newItem);


        p.aggregate([
          { $match: {_schemaName:"List", type: "projectPhase", legislation: 2018} }
        ])
          .toArray()
          .then((arr) => {
            let i = 0;
            for (let item of arr) {
              p.update(
                { _id: item._id },
                {
                  $set: { listOrder: docList_order_2018[i] }
                }
              )
              i++;
            }
          }
          ).catch((e) => {
            console.log("error: ", e);
            mClient.close()
        });

        p.aggregate([
          { $match: {_schemaName:"List", type: "projectPhase", legislation: 2002} }
        ])
          .toArray()
          .then((arr) => {
            let i = 0;
            for (let item of arr) {
              p.update(
                { _id: item._id },
                {
                  $set: { listOrder: docList_order_2002[i] }
                }
              )
              i++;
            }
            mClient.close();
          }
          ).catch((e) => {
            console.log("error: ", e);
            mClient.close()
        });
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
