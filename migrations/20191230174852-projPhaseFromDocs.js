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
      var phases2002 = await getPhaseList(p, 2002);
      var allPhases = await getPhaseList(p)
      var docsWithoutPhase = [];
      var projectsWithoutDocPhase = [];
      var updateCandidates = [];
      // all published documents grouped by project, sorted by datePosted
      var projectDocs = await getDocsByProject(p);
      // loop through project groups
      for (let docArray of projectDocs) {
        if (!docArray) {
          continue;
        }

        var mostRecentDocBeforeAmendment = '';
        var mostRecentDoc = '';
        var projectId = docArray._id;
        var mostRecentDocStack = [];
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
            if (docPhase.listOrder > mostRecentDocPhase.listOrder) {
              mostRecentDoc = doc;
            }
          }
          let mostRecentDocPhaseName = await getObjById(p, mostRecentDoc.projectPhase)
          // console.log(`mostRecentDocPhaseName:  ${mostRecentDocPhaseName}, mostRecentDocPhase: ${mostRecentDoc.projectPhase}`)
          if (!mostRecentDocStack.includes(mostRecentDocPhaseName.name)) {
            mostRecentDocStack.push(mostRecentDocPhaseName.name)
          }
        }

        var invalidProjectIds = [];
        var project = await getProject(p, projectId);
        if (!project[0]) {
          invalidProjectIds.push(projectId)
          continue;
        }

        let projId = mongoose.Types.ObjectId(projectId).toString();
        if (!mostRecentDoc) {
          projectsWithoutDocPhase.push({ "projectId": projId, "name": project[0].default.name })
          continue;
        }

        mostRecentDocPhase = await getObjById(p, mostRecentDoc.projectPhase)
        if (!mostRecentDocPhase) {
          continue;
        }

// use EA Decision to validate the phase from recent docs
        let phaseToSet = '';
        let phaseParsed = {};
        let phaseHistory = [];
        let eacDecision = await getObjById(p, project[0].default.eacDecision)
        const [completePhase] = namesToIds(allPhases, ["Complete"])
        // const [pdCompletePhase] = namesToIds(phases2002, ["Post Decision - Complete"]);
        const [preConstructionPhase] = namesToIds(phases2002, ["Post Decision - Pre-Construction"]);
        const [preAppPhase] = namesToIds(phases2002, ["Pre-Application"]);
        const [withdrawalPhase] = namesToIds(phases2002, ["Withdrawal"])
        const [terminatedPhase] = namesToIds(phases2002, ["Termination"])
        if (!eacDecision) {
          // just use doc phase, convert to use phaseStack
          phaseToSet = namesToIds(allPhases, [mostRecentDocStack.pop()]);
          phaseHistory = namesToIds(allPhases, mostRecentDocStack);
        } else {
          var postDecisions = [ "Post Decision - Pre-Construction", "Post Decision - Construction", "Post Decision - Operation", "Post Decision - Care & Maintenance", "Post Decision - Decommission" ];
          switch(eacDecision.name) {
            // 2002
            case "Terminated":
              // 2002 = Termination
              phaseToSet = terminatedPhase;
              phaseHistory = namesToIds(allPhases, mostRecentDocStack);
              break;
            case "Withdrawn":
              // 2002 = Withdrawal
              phaseToSet = withdrawalPhase;
              phaseHistory = namesToIds(allPhases, mostRecentDocStack);
              break;
            case "Certificate Refused":
            case "Certificate Expired":
            case "Not Designated Reviewable":
              phaseToSet = completePhase;
              phaseHistory = namesToIds(allPhases, mostRecentDocStack);
              break;
            case "Certificate Issued":
              // Pre-Construction, Construction, Operation, Care & Maintenance, Decommission
              // console.log("Cert Issued, ", mostRecentDocPhase.name)
              phaseParsed = matchPhaseToDecision(postDecisions, mostRecentDocStack, allPhases)
              phaseToSet = phaseParsed.currentPhase;
              phaseHistory = phaseParsed.previousPhases;
              break;
            case "Certificate Not Required":
              //phase is one of - Pre-Construction, Construction, Operation, Care & Maintenance, Decommission
              // console.log("Cert not required, ", mostRecentDocPhase.name)
              phaseParsed = matchPhaseToDecision(postDecisions, mostRecentDocStack, allPhases)
              phaseToSet = phaseParsed.currentPhase;
              phaseHistory = phaseParsed.previousPhases;
              break;
            case "In Progress":
              //phase is one of - EA Process Phases (Pre-Application, Evaluation, Application Review, Referral
              var inProgressPhases  = ["Pre-Application", "Evaluation", "Application Review", "Referral"]
              // console.log("In progress ", mostRecentDocPhase.name)
              phaseParsed = matchPhaseToDecision(inProgressPhases, mostRecentDocStack, allPhases)
              phaseToSet = phaseParsed.currentPhase;
              phaseHistory = phaseParsed.previousPhases;
              break;
            case "Pre-EA Act Approval":
              // Pre-Construction, Construction, Operation, Care & Maintenance, Decommission
              // console.log("Pre-EA act approval")
              phaseParsed = matchPhaseToDecision(postDecisions, mostRecentDocStack, allPhases)
              phaseToSet = phaseParsed.currentPhase;
              phaseHistory = phaseParsed.previousPhases;
              break;
            case "EAC Not Required":
              phaseToSet = preConstructionPhase;
              phaseHistory = namesToIds(allPhases, mostRecentDocStack);
              break;
            case "Further Assessment Required":
              // only 1 project should have this, only Morrison
              // console.log("Pre application")
              phaseToSet = preAppPhase;
              phaseHistory = namesToIds(allPhases, mostRecentDocStack);
              break;
            default:
              console.log("default - ", eacDecision.name)
              phaseToSet = mostRecentDoc.projectPhase;
              break;
          }
        }
        // get string for csv output
        let phaseToSetName = await getObjById(p, phaseToSet);
        if (!phaseToSetName) {
          console.log(`projectid: ${projectId}, bad phase: ${phaseToSet} `)
          continue;
        }
        let docId = mongoose.Types.ObjectId(mostRecentDoc._id).toString();
        var taggingCandidate = { "project": projId, "recentDoc": docId, "projectName": project[0].default.name, "docPhase":  phaseToSetName.name, "phaseList": phaseParsed.previousNames }
        updateCandidates.push(taggingCandidate)

        // Update the project data
        if (project[0].currentLegislationYear === 'legislation_2002') {
          p.update(
            { _id: projectId },
            { $set: { 'legislation_2002.currentPhaseName': phaseToSet, 'legislation_2002.phaseHistory': phaseHistory } }
          )
        } else if (project[0].currentLegislationYear === 'legislation_1996') {
          p.update(
            { _id: projectId },
            { $set: { 'legislation_1996.currentPhaseName': phaseToSet, 'legislation_1996.phaseHistory': phaseHistory } }
          )
        } else {
          p.update(
            { _id: projectId },
            { $set: { 'legislation_2018.currentPhaseName': phaseToSet, 'legislation_2018.phaseHistory': phaseHistory } }
          )
        }
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
        { key: 'phaseList', header: 'phaseList'},
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
  // phase: amendment, milestone: amendment, type: amendment package, then amendment is done
  if (doc.type[0].name === "Amendment Package" && doc.milestone[0].name === "Amendment") {
    // console.log("Found final amendment doc: ", doc._id )
    return true;
  } else {
    return false;
  }
}

// pass project
function matchPhaseToDecision(decisionPhases, docPhaseStack, phases) {
  let phaseToTag = '';
  let previousPhases = [];
  let stackCopy = [...docPhaseStack];

  if (docPhaseStack.length === 0) {
    console.log("empty stack")
  }

  if (docPhaseStack.length === 1) {
    phaseToTag = docPhaseStack.pop()
  }

  const stackSize = docPhaseStack.length;
  for (let i = 0; i < stackSize; i++) {
    let phaseCandidate = docPhaseStack.pop();
    if (decisionPhases.includes(phaseCandidate)) {
      console.log(`Most recent phase: ${phaseCandidate}, stack: ${docPhaseStack} `)
      phaseToTag = phaseCandidate;
      previousPhases = docPhaseStack;
      break;
    }
  }

  // popped whole stack, no matching phase found, use most recent
  if (!phaseToTag) {
    phaseToTag = stackCopy.pop();
    previousPhases = stackCopy;
    // console.log("popped all stack, defaulting to most recent: ", phaseToTag );
  }

  var phaseToTagId = lookupId(phases, phaseToTag);
  var previousPhasesIds = namesToIds(phases, previousPhases);
  return { "currentPhase": phaseToTagId, "previousPhases": previousPhasesIds, "previousNames": previousPhases }
}

function lookupId(phases, name) {
  // console.log("looking up: ", name);
  var phaseId;
  [phaseId] = phases.filter(phase => {
    if (phase.name === name && phase.legislation === 2002) {
      return true;
    } else {
      return false;
    }
  })
  // not in 2002
  if (!phaseId) {
    // console.log("looking up 2018: ", name);
    [phaseId] = phases.filter(phase => {
      if (phase.name === name && phase.legislation === 2018) {
        return true;
      } else {
        return false;
      }
    })
  }
  return phaseId._id
}

function namesToIds(phases, names) {
  // console.log("mapping names: ", names)
  var phaseIds = names.map(name => {
    return lookupId(phases, name);
  })
  return phaseIds;
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
      // legislation: legiYear
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