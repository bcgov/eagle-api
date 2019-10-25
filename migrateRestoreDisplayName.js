// Retrieve
var MongoClient = require("mongodb").MongoClient;
var fs = require("fs");
var ObjectId = require("mongodb").ObjectID;

// Connect to the db
// Dev
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function(err, client) {
// Test
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function(err, client) {
// Local
MongoClient.connect("mongodb://localhost/epic", async function(err, client) {
  if (!err) {
    console.log("We are connected");
    const db = client.db("epic");

    let renameData = require(process.cwd() + "/restoreDisplayNameData");
    console.log("renameData:", renameData.length);

    for (let z = 0; z < renameData.length; z++) {
      // objLookup = await findObject(db, ObjectId(renameData[z]._id));
      updateObject(db, ObjectId(renameData[z]._id),renameData[z].displayName);
    }
    
    console.log("ALL DONE");
    client.close();
  } else{
    console.log(err);
  }
  
});


async function findObject(db, object_id) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _id: object_id })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function updateObject(db, object_id, displayName) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .updateOne({ _id: object_id },{ $set: { displayName: displayName }})
      .then(async function(data) {
        resolve(data);
      });
  });
}
