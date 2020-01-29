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
    // projectPhase = ObjectId(5d3f6c7eda7a38421829602f)	Application Review
    query = { _schemaName: "Document", labels : "Under Review" }
    update = { $set: {projectPhase: ObjectId("5d3f6c7eda7a38421829602f") } }
    applyTags(db, query , update);
    
    console.log("label : Pre-Application");
    // label : Pre-Application
    // projectPhase = ObjectId(5d3f6c7eda7a38421829602d)	Pre-Application
    query = {_schemaName: "Document", labels : "Pre-Application"};
    update = {$set:{projectPhase: ObjectId("5d3f6c7eda7a38421829602d") } };
    applyTags(db, query , update);
    
    console.log("label : EAO Generated Documents");
    // label : EAO Generated Documents
    // author = ObjectId(5cf00c03a266b7e1877504db)	EAO
    query = {_schemaName: "Document", labels : "EAO Generated Documents" };
    update = {$set:{documentAuthorTyp: ObjectId("5cf00c03a266b7e1877504db") } };
    applyTags(db, query , update);

    console.log("label : Proponent Comments/Correspondence");
    // label : Proponent Comments/Correspondence
    // author = ObjectId(5cf00c03a266b7e1877504dc)	Proponent / Certificate Holder
    query = {_schemaName: "Document", labels : "Proponent Comments/Correspondence" };
    update = {$set:{documentAuthorType: ObjectId("5cf00c03a266b7e1877504dc") } };
    applyTags(db, query , update);

    console.log("label : Public Comments/Submissions");
    // label : Public Comments/Submissions
    // author = Public, ObjectId(5cf00c03a266b7e1877504df)
    // docType = Comment Period, ObjectId(5cf00c03a266b7e1877504cd)
    query = {_schemaName: "Document", labels : "Public Comments/Submissions" };
    update = {$set:{documentAuthorType: ObjectId("5cf00c03a266b7e1877504df"), type : ObjectId("5cf00c03a266b7e1877504cd")} };
    applyTags(db, query , update);

    console.log("label : Public Comments/Submissions and projectPhase : Pre-Application");
    // milestone = ObjectId(5cf00c03a266b7e1877504e6)	Draft Application Information Requirements
    query = {_schemaName: "Document", labels : "Public Comments/Submissions", projectPhase : ObjectId("5d3f6c7eda7a38421829602d")};
    update = {$set:{label : ObjectId("5cf00c03a266b7e1877504e6") }};
    applyTags(db, query , update);

    console.log("label : Public Comments/Submissions and projectPhase : Application Review");
    // milestone = ObjectId(5cf00c03a266b7e1877504e9)	Application Review
    query = {_schemaName: "Document", labels : "Public Comments/Submissions", projectPhase : ObjectId("5d3f6c7eda7a38421829602f")};
    update = {$set:{label : ObjectId("5cf00c03a266b7e1877504e9") }};
    applyTags(db, query , update);

    console.log("label : Provincial Govt Comments/Submissions");
    // label : Provincial Govt Comments/Submissions
    // author = ObjectId(5cf00c03a266b7e1877504e0)	Other
    // docType = ObjectId(5d0d212c7d50161b92a80ee3)	Comment / Submission
    query = {_schemaName: "Document", labels : "Provincial Govt Comments/Submissions" };
    update = {$set:{documentAuthorType: ObjectId("5cf00c03a266b7e1877504e0"), type : ObjectId("5d0d212c7d50161b92a80ee3")} };
    applyTags(db, query , update);

    console.log("label : Amendments");
    // label : Amendments
    // projectPhase = ObjectId(5d3f6c7eda7a38421829603a)	Post Decision - Amendment
    query = {_schemaName: "Document", labels : "Amendments" };
    update =  {$set:{projectPhase: ObjectId("5d3f6c7eda7a38421829603a")} };
    applyTags(db, query , update);

    console.log("label : Annual Reports");
    // label : Annual Reports
    // docType = ObjectId(5cf00c03a266b7e1877504cf)	Report / Study 
    query = {_schemaName : "Document", labels : "Annual Reports" };
    update =  {$set:{type: ObjectId("5cf00c03a266b7e1877504cf")} };
    applyTags(db, query , update);

    console.log("label : Application and Supporting Studies");
    // label : Application and Supporting Studies
    // projectPhase = ObjectId(5d3f6c7eda7a38421829602f)	Application Review
	  // milestone = ObjectId(5cf00c03a266b7e1877504e9)	Application Review
    query = {_schemaName : "Document", labels : "Application and Supporting Studies" };
    update =  {$set:{projectPhase: ObjectId("5d3f6c7eda7a38421829602f"), label: ObjectId("5cf00c03a266b7e1877504e9") } };
    applyTags(db, query , update);

    console.log("label : Application Terms of Reference/Information Requirements");
    // label : Application Terms of Reference/Information Requirements
    // projectPhase = ObjectId(5d3f6c7eda7a38421829602d)	Pre-Application
    // docType = ObjectId(5cf00c03a266b7e1877504d3)	Application Information Requirements
    query = {_schemaName: "Document", labels : "Application Terms of Reference/Information Requirements" };
    update =  {$set:{projectPhase: ObjectId("5d3f6c7eda7a38421829602d"), type: ObjectId("5cf00c03a266b7e1877504d3") } };
    applyTags(db, query , update);

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