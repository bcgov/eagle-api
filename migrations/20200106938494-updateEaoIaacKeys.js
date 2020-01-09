'use strict';

const mongoose = require('mongoose');

let dbm;
let type;
let seed;

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
  const errors = [];

  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(async (client) => {
      const updatePromises = [];
      mClient = client;
      
      const collection = mClient.collection('epic');

      // Get the EA Decisions.
      const eaDecisions = await collection.aggregate([
        { $match: { _schemaName:'List', type: 'eaDecisions' } }
      ])
      .toArray();

      // Get IAAC Involvements.
      const iaacInvolements = await collection.aggregate([
        { $match: { _schemaName: 'List', type: 'ceaaInvolvements' } }
      ])
      .toArray();

      // Get all projects.
      const projects = await collection.aggregate([
        { $match: { _schemaName:'Project' } }
      ])
      .toArray();

      projects.forEach(project => {
        if (project.legislation_1996) {
          // Use the 2002 terms for 1996.
          const ceaaInvolvementId = getNameId(project.legislation_1996.CEAAInvolvement,  2002, iaacInvolements);
          const eaDecisionId = getNameId(project.legislation_1996.eacDecision, 2002, eaDecisions);

          if (ceaaInvolvementId && eaDecisionId) {
            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_1996.CEAAInvolvement': mongoose.Types.ObjectId(ceaaInvolvementId),
                    'legislation_1996.eacDecision':mongoose.Types.ObjectId(eaDecisionId)
                  }
                }
              )
            );
          } 
          else {
            errors.push({
              projectId: project._id, 
              message: `CEAAInvolvement: '${project.legislation_1996.CEAAInvolvement}' found '${ceaaInvolvementId}',
                        eacDecision: '${project.legislation_1996.eacDecision}' found '${eaDecisionId}'`
            });
          }
          
        }

        if (project.legislation_2002) {
          const ceaaInvolvementId = getNameId(project.legislation_2002.CEAAInvolvement, 2002, iaacInvolements);
          const eaDecisionId = getNameId(project.legislation_2002.eacDecision, 2002, eaDecisions);

          if (ceaaInvolvementId && eaDecisionId) {
            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_2002.CEAAInvolvement': mongoose.Types.ObjectId(ceaaInvolvementId),
                    'legislation_2002.eacDecision': mongoose.Types.ObjectId(eaDecisionId)
                  }
                }
              )
            );
          } 
          else {
            errors.push({
              projectId: project._id, 
              message: `CEAAInvolvement: '${project.legislation_2002.CEAAInvolvement}' found '${ceaaInvolvementId}',
                        eacDecision: '${project.legislation_2002.eacDecision}' found '${eaDecisionId}'`
            });
          }
        }

        if (project.legislation_2018) {
          const ceaaInvolvementId = getNameId(project.legislation_2018.CEAAInvolvement, 2018, iaacInvolements);
          const eaDecisionId = getNameId(project.legislation_2018.eacDecision, 2018, eaDecisions);

          if (ceaaInvolvementId && eaDecisionId) {
            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_2018.CEAAInvolvement': mongoose.Types.ObjectId(ceaaInvolvementId),
                    'legislation_2018.eacDecision': mongoose.Types.ObjectId(eaDecisionId)
                  }
                }
              )
            );
          }
          else {
            errors.push({
              projectId: project._id, 
              message: `CEAAInvolvement: '${project.legislation_2018.CEAAInvolvement}' found '${ceaaInvolvementId}',
                        eacDecision: '${project.legislation_2018.eacDecision}' found '${eaDecisionId}'`
            });
          }
        }
      });

      // Wait for all promises to resolve before closing the DB connection.
      await Promise.all(updatePromises);

      // Print any errors.
      if (errors.length > 0) {
        console.log('Errors updating project keys: ', JSON.stringify(errors));
      }

      mClient.close();
    })
    .catch((e) => {
      console.log('e:', e);
      mClient.close();
    });
};
  

exports.down = function(db) {
  return null;
};

exports._meta = {
  'version': 1
};


const getNameId = (name, year, collection) => {
  const matchedItem = collection.find(item => (item.name === name && item.legislation === year));
  if (matchedItem && matchedItem._id) {
    return matchedItem._id;
  }
  else {
    return undefined;
  }
};
