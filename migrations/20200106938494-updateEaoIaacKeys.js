'use strict';

module.exports = {
  async up(db, client) {
    let mClient;
    const errors = [];

    return db.connection.connect(db.connectionString, { native_parser: true })
      .then(async (client) => {
        const updatePromises = [];
        mClient = client;

        const collection = db.collection('epic');

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

      })
      .catch((e) => {
        console.log('e:', e);
      });
  },

  async down(db, client) {
    return null;
  }
};
