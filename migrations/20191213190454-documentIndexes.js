'use strict';

var dbm;
var type;
var seed;

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
      var epicCollection = mClient.collection('epic');
      // drop existing index, see dbFieldClean migration
      await dropProjectIndex(epicCollection)
      // apply index to capture embedded project data structure
      await applyCustomFullTextSearchIndex(epicCollection)
      mClient.close()
    })
};

async function dropProjectIndex(epicCollection) {
  return new Promise(function(resolve, reject) {
    console.log("Dropping existing index on projects")
    resolve(epicCollection.dropIndex("searchIndex_EAR_1"))
  })
}

async function applyCustomFullTextSearchIndex(targetCollection) {
  return new Promise(function(resolve, reject) {
    console.log("applying multifield custom FTS index");
    resolve(targetCollection.createIndex( {
      // projects
      "legislation_1996.name": "text",
      "legislation_2002.name": "text",
      "legislation_2018.name": "text",
      "legislation_1996.eacDecision": "text",
      "legislation_2002.eacDecision": "text",
      "legislation_2018.eacDecision": "text",
      "legislation_1996.location": "text",
      "legislation_2002.location": "text",
      "legislation_2018.location": "text",
      "legislation_1996.region": "text",
      "legislation_2002.region": "text",
      "legislation_2018.region": "text",
      "legislation_1996.commodity": "text",
      "legislation_2002.commodity": "text",
      "legislation_2018.commodity": "text",
      "legislation_1996.type": "text",
      "legislation_2002.type": "text",
      "legislation_2018.type": "text",
      "legislation_1996.epicProjectId": "text",
      "legislation_2002.epicProjectId": "text",
      "legislation_2018.epicProjectId": "text",
      "legislation_1996.sector": "text",
      "legislation_2002.sector": "text",
      "legislation_2018.sector": "text",
      "legislation_1996.status": "text",
      "legislation_2002.status": "text",
      "legislation_2018.status": "text",
      "legislation_1996.code": "text",
      "legislation_2002.code": "text",
      "legislation_2018.code": "text",
      // documents
      name: "text",
      displayName: "text",
      description: "text",
      labels: "text",
      documentFileName: "text",
      documentAuthor: "text",
      //recentActivity
      headline: "text",
      content: "text",
      //user
      orgName: "text"
     },
      {
        weights: {
          "legislation_1996.name": 9000,
          "legislation_2002.name": 9000,
          "legislation_2018.name": 9000,
            name: 9000,
            displayName: 8500,
            description: 8000,
            labels: 6000,
            documentFileName: 5000,
            documentAuthor: 3000,
            headline: 1,
            content: 1,
            orgName: 1,
        },
        name: "searchIndex_EAR_1"
      }
    ));
  });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
