'use strict';

var dbm;
var type;
var seed;
const mongoose = require('mongoose');
const model = require('../api/helpers/models/legislationSpecificProjectData')


/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
}

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {

      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');

      // get all existing projects
      p.aggregate([
        {
          $match: { _schemaName: "Project" }
        }
      ])
        .toArray()
        .then(function (arr) {
          for (let item of arr) {



            // get the legislation for this project
            let legislation = item.legislation

            // change the schema name from project to projectData
            let projectId = item._id

            //   create a new LegislationSpecificProjectData object with all the same fields as in the current projects
            var legislationSpecificProjectData = {
              _schemaName             : "LegislationSpecificProjectData",
              CEAAInvolvement         : item.CEAAInvolvement,
              CELead                  : item.CELead,
              CELeadEmail             : item.CELeadEmail,
              CELeadPhone             : item.CELeadPhone,
              centroid                : item.centroid,
              description             : item.description,
              eacDecision             : item.eacDecision,
              location                : item.location,
              name                    : item.name,
              projectLeadId           : item.projectLeadId,
              projectLead             : item.projectLead,
              projectLeadEmail        : item.projectLeadEmail,
              projectLeadPhone        : item.projectLeadPhone,
              proponent               : item.proponent,
              region                  : item.region,
              responsibleEPDId        : item.responsibleEPDId,
              responsibleEPD          : item.responsibleEPD,
              responsibleEPDEmail     : item.responsibleEPDEmail,
              responsibleEPDPhone     : item.responsibleEPDPhone,
              type                    : item.type,
              legislation             : item.legislation,
              addedBy                 : item.addedBy,
              build                   : item.build,
              CEAALink                : item.CEAALink,
              code                    : item.code,
              commodity               : item.commodity,
              currentPhaseName        : item.currentPhaseName,
              dateAdded               : item.dateAdded,
              dateCommentsClosed      : item.dateCommentsClosed,
              dateCommentsOpen        : item.dateCommentsOpen,
              dateUpdated             : item.dateUpdated,
              decisionDate            : item.decisionDate,
              duration                : item.duration,
              eaoMember               : item.eaoMember,
              epicProjectID           : item.epicProjectID,
              fedElecDist             : item.fedElecDist,
              intake                  : item.intake,
              isTermsAgreed           : item.isTermsAgreed,
              overallProgress         : item.overallProgress,
              primaryContact          : item.primaryContact,
              proMember               : item.proMember,
              provElecDist            : item.provElecDist,
              sector                  : item.sector,
              shortName               : item.shortName,
              status                  : item.status,
              substitution            : item.substitution,
              eaStatusDate            : item.eaStatusDate,
              eaStatus                : item.eaStatus,
              projectStatusDate       : item.projectStatusDate,
              substantiallyDate       : item.substantiallyDate,
              substantially           : item.substantially,
              activeDate              : item.activeDate,
              activeStatus            : item.activeStatus,
              projLead                : item.projLead,
              execProjectDirector     : item.execProjectDirector,
              complianceLead          : item.complianceLead,
              pins                    : item.pins,
              pinsHistory             : item.pinsHistory,
              groups                  : item.groups,
              read                    : item.read,
              write                   : item.write,
              delete                  : item.delete
            };

            p.insertOne(legislationSpecificProjectData);

            let legislationSpecificProjectDataId = legislationSpecificProjectData._id

            // add new fields to project
            if (legislation == "1996 Environmental Assessment Act"){
              p.update(
                {
                  _id: projectId
                },
                {
                  $set: {
                    currentProjectData: legislationSpecificProjectDataId,
                    allProjectDataByLegislation: [{1996: legislationSpecificProjectDataId}]
                  }
                }
              );
            } else {
              p.update(
                {
                  _id: projectId
                },
                {
                  $set: {
                    currentProjectData: legislationSpecificProjectDataId,
                    allProjectDataByLegislation: [{2002: legislationSpecificProjectDataId}]
                  }
                }
              );
            }

            // delete old data
            p.update(
              {
                _id: projectId
              },
              {
                $unset: {
                  CEAAInvolvement         : 1,
                  CELead                  : 1,
                  CELeadEmail             : 1,
                  CELeadPhone             : 1,
                  centroid                : 1,
                  description             : 1,
                  eacDecision             : 1,
                  location                : 1,
                  name                    : 1,
                  projectLeadId           : 1,
                  projectLead             : 1,
                  projectLeadEmail        : 1,
                  projectLeadPhone        : 1,
                  proponent               : 1,
                  region                  : 1,
                  responsibleEPDId        : 1,
                  responsibleEPD          : 1,
                  responsibleEPDEmail     : 1,
                  responsibleEPDPhone     : 1,
                  type                    : 1,
                  legislation             : 1,
                  addedBy                 : 1,
                  build                   : 1,
                  CEAALink                : 1,
                  code                    : 1,
                  commodity               : 1,
                  currentPhaseName        : 1,
                  dateAdded               : 1,
                  dateCommentsClosed      : 1,
                  dateCommentsOpen        : 1,
                  dateUpdated             : 1,
                  decisionDate            : 1,
                  duration                : 1,
                  eaoMember               : 1,
                  epicProjectID           : 1,
                  fedElecDist             : 1,
                  intake                  : 1,
                  isTermsAgreed           : 1,
                  overallProgress         : 1,
                  primaryContact          : 1,
                  proMember               : 1,
                  provElecDist            : 1,
                  sector                  : 1,
                  shortName               : 1,
                  status                  : 1,
                  substitution            : 1,
                  eaStatusDate            : 1,
                  eaStatus                : 1,
                  projectStatusDate       : 1,
                  substantiallyDate       : 1,
                  substantially           : 1,
                  activeDate              : 1,
                  activeStatus            : 1,
                  projLead                : 1,
                  execProjectDirector     : 1,
                  complianceLead          : 1,
                  pins                    : 1,
                  pinsHistory             : 1,
                  groups                  : 1,
                  read                    : 1,
                  write                   : 1,
                  delete                  : 1
                }
              }
            );
          }
          mClient.close();
        });
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });}

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
