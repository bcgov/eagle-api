'use strict';

var dbm;
var type;
var seed;
var fs = require("fs");
var moment = require("moment")

// todo use moment for all?
const DATE_2005 = new Date('2005-01-01')
const DATE_2002 = new Date('2002-01-01')
const DATE_1901 = new Date('1901-01-01')
const DATE_2003 = moment('2003-01-01')
var orphanList = []

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  
};

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true})
    .then(async function(mClientInst, callback) {
      mClient = mClientInst;
      var p = mClient.collection('epic');
      console.log("Beginning document migration")

      var filedata = fs.readFileSync(process.cwd() + '/migrations_data/ProjectsByLegislation.json', "utf8");
      let projectsObj = JSON.parse(filedata);
      const projects1996 = projectsObj['1996']
      const projectsTransition = projectsObj['transition']
      const projects2002 = projectsObj['2002']

      // Add new field to all documents
      let updates = await setVettedFieldToDefault(p)

      // any document created before Jan 1, 2002 can be tagged as 1996 legislation
      p.updateMany(
        { _schemaName: "Document", datePosted: { $lt: new Date('2002-01-01'), $gt: new Date('1901-01-01') } },
        { $set: { legislation: 1996, legislationYearVetted: true } }
      )
      
      // deal with docs with creation dates around 1900
      var mislabeledDocs = await get1900Documents(p)
      for (let item of mislabeledDocs) {
        let project = await findProjectById(p, item.project)
        let rawProjectData = await findProjectDataById(p, project[0].currentProjectData)
        let projectData = rawProjectData[0]
        // console.log("project name: ", projectData.name)
        if (projects1996.includes(projectData.name)) {
          // console.log("found a 96 project")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 1996, legislationYearVetted: true } }
          )
        } else if (projects2002.includes(projectData.name)) {
          // console.log("foudn a 2002 project")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 2002, legislationYearVetted: true } }
          )
        } else if (projectsTransition.includes(projectData.name)) {
          // console.log("found a transition proejct")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 2002 } }
          )
        } else {
          // console.log("Found a document with no known project: ", item._id)
        }
      }


      // any document created after Jan 1, 2005 AND is a transition project can be tagged as 2002 legislation
      console.log("Tagging documents with 2002 legislation")
      var docs2005 = await get2005Documents(p)
      for (let item of docs2005) {
        let project = await findProjectById(p, item.project)
        if (project.length < 1) {
          continue;
        }
        let rawProjectData = await findProjectDataById(p, project[0].currentProjectData)
        let projectData = rawProjectData[0]
        // console.log("projectData: ", projectData)
        if (projectsTransition.includes(projectData.name)) {
          // console.log("Found doc created 2005+ and is from a transition project")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 2002, legislationYearVetted: true } }
          )
        }
      }

      // get docs between 2002 and 2005
      console.log("Tagging transition documents (2002 - 2005)")
      var transitionDocs = await getTransitionDocuments(p)
      for (let item of transitionDocs) {    
        let project = await findProjectById(p, item.project)
        let rawProjectData = await findProjectDataById(p, project[0].currentProjectData)
        let projectData = rawProjectData[0]
        // console.log(projectData)
        // 2002 = any project created after jan 1, 2003
        if (projects2002.includes(projectData.name)) {
          // console.log("found 2002 vettable doc")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 2002, legislationYearVetted: true } }
          )
        } else if (projectsTransition.includes(projectData.name)) {
          // console.log("found 2002 doc, needs verification")
          p.updateOne(
            { _id: item._id },
            { $set: { legislation: 2002 } }
          )
        } else if (projectData.name) {
          // console.log("project: ", projectData.name)
        } else {
          // console.log("found orphan doc")
        }
      }

        // find orphans
      console.log("Checking for orphaned documents")
      var allDocs = await getAllDocuments(p)
      for (let item of allDocs) {
        let project = await findProjectById(p, item.project)
        if (project === undefined || project.length < 1) {
          orphanList.push(
            { id: "" + item._id, name: "" + item.documentFileName }
          );
        }
      }
      console.log("Orphan documents found: ", orphanList.length);
      let json = JSON.stringify(orphanList);
      fs.writeFileSync("orphanDocs.json", json, "utf8");

      mClient.close()
    }).catch((e) => {
      console.log("error: ", e);
      mClient.close()
  });
};

async function setVettedFieldToDefault(db) {
  return new Promise(function(resolve, reject) {
    db.updateMany(
      { _schemaName: "Document" },
      {  $set: { legislationYearVetted: false } }
    ).then(async function(data) {
      resolve(data)
    });
  });
}

// get project by id, return LegislationData id
async function getTransitionDocuments(db) {
  return new Promise(function(resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document", datePosted: { $lt: DATE_2005, $gt: DATE_2002 }} }])
    .toArray()
    .then(async function(data) {
      resolve(data)
    })
  });
}

// get project by id, return LegislationData id
async function get2005Documents(db) {
  return new Promise(function(resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document", datePosted: { $gte: DATE_2005 } } } ])
    .toArray()
    .then(async function(data) {
      resolve(data)
    })
  });
}

async function get1900Documents(db) {
  return new Promise(function(resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document", datePosted: { $lte: DATE_1901 } } } ])
    .toArray()
    .then(async function(data) {
      resolve(data)
    })
  });
}

async function getAllDocuments(db) {
  return new Promise(function(resolve, reject) {
    db.aggregate([
      { $match: { _schemaName: "Document" } } ])
    .toArray()
    .then(async function(data) {
      resolve(data)
    })
  });
}

// get project by id, return LegislationData id
async function findProjectById(db, projectId ) {
  return new Promise(function(resolve, reject) {
    db.find({ _schemaName: "Project", _id: projectId } )
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

// get LegislationData by id, return project
async function findProjectDataById(db, projectId ) {
  return new Promise(function(resolve, reject) {
    db.find({ _schemaName: "LegislationSpecificProjectData", _id: projectId } )
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

// get LegislationData by id, return projectData
async function findProjectDataByName(db, name ) {
  return new Promise(function(resolve, reject) {
    db.find({ _schemaName: "LegislationSpecificProjectData", _id: name } )
      .toArray()
      .then(async function(data) {
        resolve(data);
      });
  });
}

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
