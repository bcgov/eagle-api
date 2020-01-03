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

        let documentTagsData = require(process.cwd() + '/GaloreCreek');

        console.log("Updating tags on " + documentTagsData.length + " documents.");

        for (let i = 0; i < documentTagsData.length; i++) {
            let object_id = documentTagsData[i]._id.substring(9,33);
            let newDocumentType = documentTagsData[i].type.substring(9,33);
            let newDocumentAuthor = documentTagsData[i].documentAuthorType.substring(9,33);
            let newProjectPhase = documentTagsData[i].projectPhase.substring(9,33);
            let newMilestone = documentTagsData[i].milestone.substring(9,33);
            await updateDocument(db, ObjectId(object_id), ObjectId(newDocumentType), ObjectId(newDocumentAuthor), ObjectId(newProjectPhase), ObjectId(newMilestone));
        }
        console.log("ALL DONE");
        client.close();
      } else{
        console.log(err);
      }
});

async function updateDocument(db, object_id, newDocumentType, newDocumentAuthor, newProjectPhase, newMilestone) {
    return new Promise(function(resolve, reject) {
      db.collection("epic")
        .updateOne({ _id: object_id },
        { $set: { type: newDocumentType , documentAuthorType: newDocumentAuthor, projectPhase: newProjectPhase, milestone: newMilestone }})
        .then(async function(data) {
          resolve(data);
        });
    });
}