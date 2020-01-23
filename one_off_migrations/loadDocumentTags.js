// Retrieve
var MongoClient = require("mongodb").MongoClient;
var fs = require("fs");
var mongoose = require("mongoose");
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
var args = process.argv.slice(2);
if (!args[0]) {
  console.log("ERROR: Please provide filename as arg. Exciting")
  return
}
// Make sure the headers match the csv and the requirements
const csvFilePath = args[0]
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
});
MongoClient.connect("mongodb://localhost/epic", async function(err, client) {
    if (!err) {
        console.log("We are connected");
        const db = client.db("epic");

        console.log("Updating tags on " + docTagArray.length + " documents.");

        for (let i = 0; i < docTagArray.length; i++) {
          // JSON parse this! thanks morgan3
          let projectid = docTagArray[i].projectid;
            let newDocumentType = (docTagArray[i].doctype === "") ? null : docTagArray[i].doctype;
            let newDocumentAuthor = (docTagArray[i].author === "") ? null : docTagArray[i].author;
            let newProjectPhase = (docTagArray[i].phase === "") ? null : docTagArray[i].phase;
            let newMilestone = (docTagArray[i].milestone === "") ? null : docTagArray[i].milestone;
            // This datePosted will never exist with the csvs we have now. Also we do not pass through a datePosted
            try {
              if(docTagArray[i].datePosted){
                  let documentDate = (docTagArray[i].milestone === "") ? null : new Date(docTagArray[i].datePosted);
                  await updateTagsDates(db, (projectid),(newDocumentType), (newDocumentAuthor),(newProjectPhase), (newMilestone), documentDate);
              } else {
                  await updateDocumentTags(db, (projectid),(newDocumentType), (newDocumentAuthor),(newProjectPhase), (newMilestone));
              }
            } catch(err) {
              console.log(err)
            }
        }
        console.log("ALL DONE");
        client.close();
      } else {
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
    }).catch(function(error) {
      console.log(error)
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
    }).catch(function(error) {
      console.log(error)
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