// Retrieve
var MongoClient = require("mongodb").MongoClient;
var fs = require("fs");
var ObjectId = require("mongodb").ObjectID;
const csvtojson = require("csvtojson");

/*
HOW TO RUN:
node loadDocumentTags.js <project data>
Ex. If your data is in a file called GaloreCreek.json in the same directory, run:
node loadDocumentTags.js GaloreCreek
*/

// Connect to the db
// Dev
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function(err, client) {
// Test
// MongoClient.connect("mongodb://x:x@localhost:5555/epic", async function(err, client) {
// Local
// Make sure the headers match the csv and the requirements
const csvFilePath='EPIC Tagging Engine - Nahwitti.csv'
const requiredHeaders = ['projectid', 'documentid', 'doctype', 'author', 'phase', 'milestone'];
let docTagArray = []
csvtojson({
  noheader: false,
  ignoreEmpty: true,
  headers: ['title','schema','projectid','documentid','displayname','filename','doctype', 'author','phase','milestone','labels', ]
})
.fromFile(csvFilePath)
.then((jsonObj)=>{
 jsonObj.forEach(obj => {
   if (checkHeaders(obj)) {
    // Need to only push the required headers
    docTagArray.push({
      projectid: obj.projectid, 
      documentid: obj.documentid, 
      doctype: obj.doctype, 
      author: obj.author, 
      phase: obj.phase, 
      milestone: obj.milestone})
  }
})
console.log(docTagArray)
});
var args = process.argv.slice(2);
if (!args[0]) {
  console.log("ERROR: Please provide filename as arg. Exciting")
  return
}
MongoClient.connect("mongodb://localhost/epic", async function(err, client) {
    if (!err) {
        console.log("We are connected");
        const db = client.db("epic");
        let documentTagsData = require(process.cwd() + '/' + args[0]);

        console.log("Updating tags on " + documentTagsData.length + " documents.");

        for (let i = 0; i < documentTagsData.length; i++) {
            let object_id = documentTagsData[i]._id.substring(9,33);
            let newDocumentType = (documentTagsData[i].type === "") ? null : documentTagsData[i].type.substring(9,33);
            let newDocumentAuthor = (documentTagsData[i].documentAuthorType === "") ? null : documentTagsData[i].documentAuthorType.substring(9,33);
            let newProjectPhase = (documentTagsData[i].projectPhase === "") ? null : documentTagsData[i].projectPhase.substring(9,33);
            let newMilestone = (documentTagsData[i].milestone === "") ? null : documentTagsData[i].milestone.substring(9,33);
            if(documentTagsData[i].datePosted){
                let documentDate = (documentTagsData[i].milestone === "") ? null : new Date(documentTagsData[i].datePosted);
                await updateTagsDates(db, ObjectId(object_id), ObjectId(newDocumentType), ObjectId(newDocumentAuthor), ObjectId(newProjectPhase), ObjectId(newMilestone), documentDate);
            } else {
                await updateDocumentTags(db, ObjectId(object_id), ObjectId(newDocumentType), ObjectId(newDocumentAuthor), ObjectId(newProjectPhase), ObjectId(newMilestone));
            }
        }
        console.log("ALL DONE");
        client.close();
      } else{
        console.log(err);
      }
});

async function updateTagsDates(db, object_id, newDocumentType, newDocumentAuthor, newProjectPhase, newMilestone, newDocumentDate) {
    return new Promise(function(resolve, reject) {
      db.collection("epic")
        .updateOne({ _id: object_id },
        { $set: { 
            type: newDocumentType, 
            documentAuthorType: newDocumentAuthor, 
            projectPhase: newProjectPhase, 
            milestone: newMilestone, 
            datePosted: newDocumentDate}},
        { upsert : true })
        .then(async function(data) {
          resolve(data);
        });
    });
}

async function updateDocumentTags(db, object_id, newDocumentType, newDocumentAuthor, newProjectPhase, newMilestone) {
    return new Promise(function(resolve, reject) {
      db.collection("epic")
        .updateOne({ _id: object_id },
        { $set: { 
            type: newDocumentType, 
            documentAuthorType: newDocumentAuthor, 
            projectPhase: newProjectPhase, 
            milestone: newMilestone, 
        }},
        { upsert : true })
        .then(async function(data) {
          resolve(data);
        });
    });
}

function checkHeaders(object) {
  let isValid = true;
  requiredHeaders.forEach(header => {
    //Check the headers have data in them
    if (object[header] === undefined || !object[header]) {
      isValid = false;
      return;
    }
  })
  return isValid;
}