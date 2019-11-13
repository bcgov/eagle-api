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

    console.log("label: Under Review")
    // projectPhase = Application Review
    tagObj = await getTagObject(db, "projectPhase", "Application Review");
    tagID = tagObj[0]._id;
    query = { _schemaName: "Document", labels : "Under Review" }
    update = { $set: {projectPhase: tagID} }
    await applyTags(db, query , update);
    
    console.log("label : Pre-Application");
    // label : Pre-Application
    // projectPhase = Pre-Application
    tagObj = await getTagObject(db, "projectPhase", "Pre-Application");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Pre-Application"};
    update = {$set:{projectPhase: tagID} };
    await applyTags(db, query , update);
    
    console.log("label : EAO Generated Documents");
    // label : EAO Generated Documents
    // author =	EAO
    tagObj = await getTagObject(db, "author", "EAO");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "EAO Generated Documents" };
    update = {$set:{documentAuthorType: tagID} };
    await applyTags(db, query , update);

    console.log("label : Proponent Comments/Correspondence");
    // label : Proponent Comments/Correspondence
    // author = 	Proponent / Certificate Holder
    tagObj = await getTagObject(db, "author", "Proponent / Certificate Holder");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Proponent Comments/Correspondence" };
    update = {$set:{documentAuthorType: tagID } };
    await applyTags(db, query , update);

    console.log("label : Public Comments/Submissions");
    // label : Public Comments/Submissions
    // author = Public
    // docType = Comment Period
    authTagObj = await getTagObject(db, "author", "Public");
    authTagID = authTagObj[0]._id;
    docTypeTagObj = await getTagObject(db, "doctype", "Comment Period");
    docTypeTagID = docTypeTagObj[0]._id;
    query = {_schemaName: "Document", labels : "Public Comments/Submissions" };
    update = {$set:{documentAuthorType: authTagID, type : docTypeTagID} };
    await applyTags(db, query , update);

    console.log("label : Public Comments/Submissions and projectPhase : Pre-Application");
    // milestone = 	Draft Application Information Requirements
    ppObj = await getTagObject(db, "projectPhase", "Pre-Application");
    ppID = ppObj[0]._id;
    tagObj = await getTagObject(db, "label", "Draft Application Information Requirements");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Public Comments/Submissions", projectPhase : ppID};
    update = {$set:{milestone : tagID }};
    await applyTags(db, query , update);


    console.log("label : Public Comments/Submissions and projectPhase : Application Review");
    // milestone = 	Application Review
    ppObj = await getTagObject(db, "projectPhase", "Application Review");
    ppID = ppObj[0]._id;
    tagObj = await getTagObject(db, "label", "Application Review");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Public Comments/Submissions", projectPhase : ppID};
    update = {$set:{milestone : tagID }};
    await applyTags(db, query , update);


    console.log("label : Provincial Govt Comments/Submissions");
    // label : Provincial Govt Comments/Submissions
    // doctype = 	Comment / Submission
    tagObj = await getTagObject(db, "doctype", "Comment / Submission");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Provincial Govt Comments/Submissions" };
    update = {$set:{type : tagID} };
    await applyTags(db, query , update);

    console.log("label : Amendments");
    // label : Amendments
    // projectPhase = 	Post Decision - Amendment
    tagObj = await getTagObject(db, "projectPhase", "Post Decision - Amendment");
    tagID = tagObj[0]._id;
    query = {_schemaName: "Document", labels : "Amendments" };
    update =  {$set:{projectPhase: tagID} };
    await applyTags(db, query , update);

    console.log("label : Annual Reports");
    // label : Annual Reports
    // docType = 	Report / Study 
    tagObj = await getTagObject(db, "doctype", "Report / Study");
    tagID = tagObj[0]._id;
    query = {_schemaName : "Document", labels : "Annual Reports" };
    update =  {$set:{type: tagID} };
    await applyTags(db, query , update);

    console.log("label : Application and Supporting Studies and Under Review");
    // projectPhase = 	Application Review
    // milestone = 	Application Review
    ppObj = await getTagObject(db, "projectPhase", "Application Review");
    ppID = ppObj[0]._id;
    tagObj = await getTagObject(db, "label", "Application Review");
    tagID = tagObj[0]._id;
    query = {_schemaName : "Document", labels : "Application and Supporting Studies" , projectPhase : ppID};
    update =  {$set:{milestone: tagID } };
    await applyTags(db, query , update);

    console.log("label : Application Terms of Reference/Information Requirements and Pre-Application");
    // projectPhase = 	Pre-Application
    // docType =	Application Information Requirements
    ppObj = await getTagObject(db, "projectPhase", "Pre-Application");
    ppID = ppObj[0]._id;

    docTypeTagObj = await getTagObject(db, "doctype", "Application Information Requirements");
    docTypeTagID = docTypeTagObj[0]._id;
    query = {_schemaName: "Document", labels : "Application Terms of Reference/Information Requirements", projectPhase :  ppID};
    update =  {$set:{type: docTypeTagID } };
    await applyTags(db, query , update);

    console.log("ALL DONE");
    client.close();
  } else {
    console.log(err);
  }
  
});

async function applyTags(db, query, update) {
  itemsCollection = db.collection("epic");
  return itemsCollection.updateMany(query, update)
    .then(result => {
      console.log(query)
      const { matchedCount, modifiedCount } = result;
      console.log(`Successfully matched ${matchedCount} and modified ${modifiedCount} items.`)
      return result
    })
    .catch(err => console.error(`Failed to update items: ${err}`))
}

async function getTagObject(db, typeName, tagName) {
  return new Promise(function(resolve, reject) {
    db.collection("epic")
      .find({ _schemaName: "List", type: typeName, name: tagName })
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}