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
      // all published documents grouped by project, sorted by datePosted
      var projectDocs = await getDocsByProject(p);
      // items is projects
      var docsListByPhase = [];
      for (let docArray of projectDocs) {
        if (!docArray) {
          continue;
        }

        var mostRecentDocBeforeAmendment = '';
        var mostRecentDoc = '';
        var projectId = docArray._id;
        // loop through project's docs
        for (let doc of docArray.docs) {

          var document = await getDocument(p, doc._id);
          if (!doc.projectPhase) {
            // console.log(doc)
            let docId = mongoose.Types.ObjectId(doc._id).toString();
            docsWithoutPhase.push({ "docId": docId, "name": document[0].displayName })
            continue;
          }

          var docPhase = await getObjById(p, doc.projectPhase);
          if (!docPhase) {
            continue;
          }
          // docs with Other, are ignored for project phase
          if (docPhase.name === 'Other') {
            continue;
          }

          if (!mostRecentDoc) {
            mostRecentDoc = doc;
          }

          if (!mostRecentDocBeforeAmendment) {
            mostRecentDocBeforeAmendment = doc;
          }

          var mostRecentDocPhase = await getObjById(p, mostRecentDoc.projectPhase)
          // not a valid phase id
          if (!mostRecentDocPhase) {
            continue;
          }
          // 
            // docsListByPhase.push({"projectId": projectId, "phase": docPhase.name, "order": docPhase.listOrder, "docId": doc._id});

          if (docPhase.name === 'Post Decision - Amendment') {
            if (amendmentDone(document[0])) {
              // amendment complete - phase should be whatever it was in before amendment started
              mostRecentDoc = mostRecentDocBeforeAmendment;
            } else {
              // amendment not done yet, phase shold be amendment
              // console.log(`Amendment not done yet or tagged enough, project: ${projectId}, doc: ${doc._id}`)
              mostRecentDoc = doc;
            }
          } else {
            mostRecentDocBeforeAmendment = doc;
            if (docPhase.listOrder >= mostRecentDocPhase.listOrder) {
              mostRecentDoc = doc;
              // mostRecentDocBeforeAmendment = doc;
            }
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
          // console.log("no valid mostrecent doc (likely all missing phase field)")
          projectsWithoutDocPhase.push({ "projectId": projId, "name": project[0].default.name })
          continue;
        }

        mostRecentDocPhase = await getObjById(p, mostRecentDoc.projectPhase)
        if (!mostRecentDocPhase) {
          continue;
        }

        // todo check EA decision, use to improve accuracy
        let phaseToSet = '';
        let eacDecision = await getObjById(p, project[0].default.eacDecision)
        const completePhase = mongoose.Types.ObjectId("5d3f6c7eda7a384218296039");
        const preConstructionPhase = mongoose.Types.ObjectId("5d3f6c7eda7a384218296034")
        if (!eacDecision) {
          // just use doc phase
          phaseToSet = mostRecentDoc.projectPhase;
        } else {
          switch(eacDecision.name) {
            // 2002
            case "Terminated":
            case "Withdrawn":
            case "Certificate Refused":
            case "Certificate Expired":
            case "Not Designated Reviewable":
              phaseToSet = completePhase;
              break;
            case "In Progress":
              phaseToSet = mostRecentDoc.projectPhase
              break;
            case "EAC Not Required":
              phaseToSet = preConstructionPhase;
              break;
            default:
              phaseToSet = mostRecentDoc.projectPhase;
              break;
          }
        }
        // console.log("Project phase: ", project[0].default.currentPhaseName)
        // console.log("Most recent doc phase: ", mostRecentDocPhase.name)
        let phaseToSetName = await getObjById(p, phaseToSet);
        if (!phaseToSetName) {
          console.log(`bad phase: ${phaseToSet} `)
          continue;
        }
        let docId = mongoose.Types.ObjectId(mostRecentDoc._id).toString();
        var taggingCandidate = { "project": projId, "recentDoc": docId, "projectName": project[0].default.name, "docPhase":  phaseToSetName.name, "oldPhase": project[0].default.currentPhaseName }
        // console.log(`Project: ${projectId}, mostRecentDoc: ${mostRecentDoc._id}, docPhase: ${mostRecentPhaseName}`)
  
        updateCandidates.push(taggingCandidate)
        // p.update(
        //   { _id: projectId },
        //   { $set: { currentPhase: mostRecentDoc.projectPhase } }
        // )
      }

      let doclists_cols = [{key: 'projectId', header: 'projectId' },{ key: 'phase', header: 'phase' }, { key: 'order', header: 'order' }, { key: 'docId', header: 'docId'}];
      CSV.stringify(docsListByPhase, { header: true, columns: doclists_cols }, function (err, data) {
        fs.writeFileSync("migrations_temp/ProjectDocsPhase.csv", data)
      })

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

function amendmentDone(doc) {
  if (!doc.projectPhase[0] || !doc.milestone[0] || !doc.type[0]) {
    // need all 3 to determine if done amendment
    return false;
  }
  // if phase: amendment, milestone: amendment, type: amendment package, then amendment is done
  if (doc.type[0].name === "Amendment Package" && doc.milestone[0].name === "Amendment") {
    console.log("Found final amendment doc: ", doc._id )
    return true;
  } else {
    return false;
  }
}

// get all published docs, grouped by project
async function getDocsByProject(db) {
  return new Promise(function (resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document" } },
      { $project: { project: 1, projectPhase: 1, datePosted: 1, legislation: 1, read: { $filter: { input: "$read", as: "published", cond: { $in: ["public", "$read"] } } } } },
      { $project: { read: 0 } },
      { $sort: { datePosted: 1 } },
      { $group: { _id: "$project", docs: { $push: "$$ROOT" } } }
    ])
      .toArray()
      .then(async function (data) {
        resolve(data)
      })
  });
}


async function getObjById(db, phaseId) {
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
    db.aggregate([
      { $match: { _id: docId } },
      { $lookup: { from: 'epic', localField: 'milestone', foreignField: '_id', as: 'milestone' }},
      { $lookup: { from: 'epic', localField: 'projectPhase', foreignField: '_id', as: 'projectPhase' }},
      { $lookup: { from: 'epic', localField: 'type', foreignField: '_id', as: 'type' }},
    ])
      .toArray()
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