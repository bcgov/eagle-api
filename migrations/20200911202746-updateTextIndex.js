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
    resolve(targetCollection.createIndex({
      "description":"text",
      "displayName":"text",
      "documentAuthor":"text",
      "documentFileName":"text",
      "headline":"text",
      "labels":"text",
      "legislation_1996.code":"text",
      "legislation_1996.commodity":"text",
      "legislation_1996.eacDecision":"text",
      "legislation_1996.epicProjectId":"text",
      "legislation_1996.location":"text",
      "legislation_1996.name":"text",
      "legislation_1996.nameSearchTerms":"text",
      "legislation_1996.region":"text",
      "legislation_1996.sector":"text",
      "legislation_1996.status":"text",
      "legislation_1996.type":"text",
      "legislation_2002.code":"text",
      "legislation_2002.commodity":"text",
      "legislation_2002.eacDecision":"text",
      "legislation_2002.epicProjectId":"text",
      "legislation_2002.location":"text",
      "legislation_2002.name":"text",
      "legislation_2002.nameSearchTerms":"text",
      "legislation_2002.region":"text",
      "legislation_2002.sector":"text",
      "legislation_2002.status":"text",
      "legislation_2002.type":"text",
      "legislation_2018.code":"text",
      "legislation_2018.commodity":"text",
      "legislation_2018.eacDecision":"text",
      "legislation_2018.epicProjectId":"text",
      "legislation_2018.location":"text",
      "legislation_2018.name":"text",
      "legislation_2018.nameSearchTerms":"text",
      "legislation_2018.region":"text",
      "legislation_2018.sector":"text",
      "legislation_2018.status":"text",
      "legislation_2018.type":"text",
      "name":"text",
      "orgName":"text"
   },
   {
      "weights":{
         "content":1,
         "description":8000,
         "displayName":8500,
         "documentAuthor":3000,
         "documentFileName":5000,
         "headline":1,
         "labels":6000,
         "legislation_1996.code":1,
         "legislation_1996.commodity":1,
         "legislation_1996.eacDecision":1,
         "legislation_1996.epicProjectId":1,
         "legislation_1996.location":1,
         "legislation_1996.name":9000,
         "legislation_1996.nameSearchTerms":9500,
         "legislation_1996.region":1,
         "legislation_1996.sector":1,
         "legislation_1996.status":1,
         "legislation_1996.type":1,
         "legislation_2002.code":1,
         "legislation_2002.commodity":1,
         "legislation_2002.eacDecision":1,
         "legislation_2002.epicProjectId":1,
         "legislation_2002.location":1,
         "legislation_2002.name":9000,
         "legislation_2002.nameSearchTerms":9500,
         "legislation_2002.region":1,
         "legislation_2002.sector":1,
         "legislation_2002.status":1,
         "legislation_2002.type":1,
         "legislation_2018.code":1,
         "legislation_2018.commodity":1,
         "legislation_2018.eacDecision":1,
         "legislation_2018.epicProjectId":1,
         "legislation_2018.location":1,
         "legislation_2018.name":9000,
         "legislation_2018.nameSearchTerms":9500,
         "legislation_2018.region":1,
         "legislation_2018.sector":1,
         "legislation_2018.status":1,
         "legislation_2018.type":1,
         "name":9000,
         "orgName":1
      },
      "name":"searchIndex_EAR_1",
      "default_language":"none"
   }));
  });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
