'use strict';

var dbm;
var type;
var seed;
var fs = require("fs");
var mongoose = require("mongoose");
const CSV = require("csv");


exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function (db) {
  //get all docs, group by project
  // in those docs - find most recent published
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(async function (mClientInst, callback) {
      mClient = mClientInst;
      var p = mClient.collection('epic');
      // var phases2002 = await getPhaseList(p, 2002);
      // var phases2018 = await getPhaseList(p, 2018);
      var docsWithoutPhase = [];
      var projectsWithoutDocPhase = [];
      var updateCandidates = [];
      var projectDocs = await getDocsByProject(p);
      // items is projects
      for (let docArray of projectDocs) {
        if (!docArray) {
          continue;
        }

        var mostRecentDoc = '';
        var projectId = docArray._id
        // loop through project's docs
        for (let doc of docArray.docs) {
          // todo need to do lookup of doc, 
          if (!doc.projectPhase) {

            var document = await getDocument(p, doc._id);
            let docId = mongoose.Types.ObjectId(doc._id).toString();
            docsWithoutPhase.push({ "docId": docId, "name": document.displayName })
            continue;
          }

          var docPhase = await getPhase(p, doc.projectPhase);
          if (!docPhase) {
            continue;
          }
          // docs with Other, are ignored for project status
          if (docPhase.name === 'Other') {
            continue;
          }

          if (!mostRecentDoc) {
            mostRecentDoc = doc;
          }

          var mostRecentDocPhase = await getPhase(p, mostRecentDoc.projectPhase)
          // not a valid phase id
          if (!mostRecentDocPhase) {
            continue;
          }

          if (docPhase.listOrder > mostRecentDocPhase.listOrder) {
            mostRecentDoc = doc;
          }
        }

        var invalidProjectIds = [];
        var project = await getProject(p, projectId);
        if (!project[0]) {
          // console.log(`Invalid project: ${projectId} \n`)
          invalidProjectIds.push(projectId)
          continue;
        }

        let projId = mongoose.Types.ObjectId(projectId).toString();
        if (!mostRecentDoc) {
          console.log("no valid mostrecent doc (likely all missing phase field)")
          console.log("projId: ", projectId)
          projectsWithoutDocPhase.push({ "projectId": projId, "name": project[0].default.name })
          continue;
        }

        mostRecentDocPhase = await getPhase(p, mostRecentDoc.projectPhase)
        if (!mostRecentDocPhase) {
          continue;
        }

        // console.log("Project phase: ", project[0].default.currentPhaseName)
        // console.log("Most recent doc phase: ", mostRecentDocPhase.name)
        let docId = mongoose.Types.ObjectId(mostRecentDoc._id).toString();
        var taggingCandidate = { "project": projId, "recentDoc": docId, "projectName": project[0].default.name, "docPhase":  mostRecentDocPhase.name, "oldPhase": project[0].default.currentPhaseName }
        // console.log(`Project: ${projectId}, mostRecentDoc: ${mostRecentDoc._id}, docPhase: ${mostRecentPhaseName}`)
  
        // todo differentiate between legislation years?? (document wise)
        updateCandidates.push(taggingCandidate)
        // p.update(
        //   { _id: projectId },
        //   { $set: { currentPhase: mostRecentDoc.projectPhase } }
        // )
      }

      console.log("Document without phase field found: ", docsWithoutPhase.length);
      let docs_cols = [{ key: 'docId', header: 'docId' }, { key: 'name', header: 'displayName' }];
      CSV.stringify(docsWithoutPhase, { header: true, columns: docs_cols }, function (err, data) {
        fs.writeFileSync("migrations_temp/DocsMissingPhase.csv", data)
      })

      console.log("Projects with docs missing any phase field found: ", projectsWithoutDocPhase.length);
      let docphase_cols = [{ key: 'projectId', header: 'projectId' }, { key: 'name', header: 'name' }];
      CSV.stringify(projectsWithoutDocPhase, { header: true, columns: docphase_cols }, function (err, data) {
        fs.writeFileSync("migrations_temp/ProjectsWithoutDocPhase.csv", data)
      })

      console.log("Projects that could be updated by documents: ", updateCandidates.length);
      let candidate_cols = [
        { key: 'project', header: 'projectId' },
        { key: 'recentDoc', header: 'mostRecentDoc' },
        { key: 'projectName', header: 'projectName'},
        { key: 'docPhase', header: 'docPhase' },
        { key: 'oldPhase', header: 'oldpPhase'}
      ];
      CSV.stringify(updateCandidates, { header: true, columns: candidate_cols }, function (err, data) {
        fs.writeFileSync("migrations_temp/TaggingCandidates.csv", data)
      })

      mClient.close();
    }).catch((e) => {
      console.log("error: ", e);
      mClient.close()
    });
};


// get all published docs, grouped by project
async function getDocsByProject(db) {
  return new Promise(function (resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document" } },
      { $project: { project: 1, projectPhase: 1, datePosted: 1, legislation: 1, read: { $filter: { input: "$read", as: "published", cond: { $in: ["public", "$read"] } } } } },
      { $project: { read: 0 } },
      { $sort: { datePosted: -1 } },
      { $group: { _id: "$project", docs: { $push: "$$ROOT" } } }
    ])
      .toArray()
      .then(async function (data) {
        resolve(data)
      })
  });
}


async function getPhase(db, phaseId) {
  return new Promise(function (resolve, reject) {
    db.findOne({
      _id: phaseId
    })
      .then(async function (data) {
        resolve(data)
      })
  })
}

async function getDocument(db, docId) {
  return new Promise(function (resolve, reject) {
    db.findOne({
      _id: docId
    })
      .then(async function (data) {
        resolve(data)
      })
  })
}

async function getProject(db, projId) {
  return new Promise(function (resolve, reject) {
    db.aggregate([
      { $match: { _id: projId } },
      {
        $addFields: {
          "default": {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$currentLegislationYear", 'legislation_1996'] },
                  then: "$legislation_1996"
                },
                {
                  case: { $eq: ["$currentLegislationYear", 'legislation_2002'] },
                  then: "$legislation_2002"
                },
                {
                  case: { $eq: ["$currentLegislationYear", 'legislation_2018'] },
                  then: "$legislation_2018"
                }
              ], default: "$legislation_2002"
            }
          }
        }
      }])
      .toArray()
      .then(async function (data) {
        resolve(data)
      })
  })
}

async function getPhaseList(db, legiYear) {
  return new Promise(function (resolve, reject) {
    db.find({
      _schemaName: "List",
      type: "projectPhase",
      legislation: legiYear
    })
      .toArray()
      .then(async function (data) {
        resolve(data)
      })
  })
}

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};