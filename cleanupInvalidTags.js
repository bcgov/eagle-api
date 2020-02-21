// Retrieve
var MongoClient = require("mongodb").MongoClient;
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

    let typeData = require(process.cwd() + "/null_type");
    console.log("typeData:", typeData.length);

    let projectPhaseData = require(process.cwd() + "/null_projectPhase");
    console.log("projectPhaseData:", projectPhaseData.length);

    let authorData = require(process.cwd() + "/null_author");
    console.log("authorData:", authorData.length);

    let milestoneData = require(process.cwd() + "/null_milestone");
    console.log("milestoneData:", milestoneData.length);

    const typePromises = [];
    for (let z = 0; z < typeData.length; z++) {
      let object_id = typeData[z]._id.substring(9,33);
      typePromises.push(updateType(db, ObjectId(object_id)));
    }

    const projectPromises = [];
    for (let z = 0; z < projectPhaseData.length; z++) {
      let object_id = projectPhaseData[z]._id.substring(9,33);
      projectPromises.push(updateProjectPhase(db, ObjectId(object_id)));
    }

    const authorPromises = [];
    for (let z = 0; z < authorData.length; z++) {
      let object_id = authorData[z]._id.substring(9,33);
      authorPromises.push(updateAuthor(db, ObjectId(object_id)));
    }

    const milestonePromises = [];
    for (let z = 0; z < milestoneData.length; z++) {
      let object_id = milestoneData[z]._id.substring(9,33);
      milestonePromises.push(updateMilestone(db, ObjectId(object_id)));
    }

    await Promise.all([projectPromises, authorPromises, milestonePromises, typePromises]);
    console.log("ALL DONE");
    client.close();
  } else{
    console.log(err);
  }
});


async function updateType(db, object_id) {
  return new Promise(function(resolve) {
    db.collection("epic")
      .updateOne({ _id: object_id },{ $set: { type: null }})
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function updateProjectPhase(db, object_id) {
  return new Promise(function(resolve) {
    db.collection("epic")
      .updateOne({ _id: object_id },{ $set: { projectPhase: null }})
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function updateMilestone(db, object_id) {
  return new Promise(function(resolve) {
    db.collection("epic")
      .updateOne({ _id: object_id },{ $set: { milestone: null }})
      .then(async function(data) {
        resolve(data);
      });
  });
}

async function updateAuthor(db, object_id) {
  return new Promise(function(resolve) {
    db.collection("epic")
      .updateOne({ _id: object_id },{ $set: { documentAuthorType: null }})
      .then(async function(data) {
        resolve(data);
      });
  });
}
