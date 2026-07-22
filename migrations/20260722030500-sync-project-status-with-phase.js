'use strict';

const { ObjectId } = require('mongodb');

module.exports = {
  async up(db, client) {
    const epicCollection = db.collection('epic');

    // 1. Fetch all projects
    const projects = await epicCollection.find({ _schemaName: 'Project' }).toArray();
    console.log(`Found ${projects.length} projects to check.`);

    // 2. Extract distinct currentPhaseName ObjectIds
    const phaseIds = [...new Set(
      projects
        .map(p => p.currentPhaseName)
        .filter(id => id && (typeof id === 'object' || typeof id === 'string'))
        .map(id => id.toString())
    )].map(idStr => new ObjectId(idStr));

    if (phaseIds.length === 0) {
      console.log('No currentPhaseName IDs found in any project.');
      return;
    }

    // 3. Fetch list items corresponding to these phaseIds
    const listItems = await epicCollection.find({
      _schemaName: 'List',
      _id: { $in: phaseIds }
    }).toArray();

    const phaseMap = {};
    for (const item of listItems) {
      phaseMap[item._id.toString()] = item.name;
    }

    // 4. Update project statuses
    let updatedCount = 0;
    for (const project of projects) {
      const phaseId = project.currentPhaseName;
      if (!phaseId) continue;

      const phaseName = phaseMap[phaseId.toString()];
      if (!phaseName) {
        console.warn(`Project ${project.name || project._id} (${project._id}) has currentPhaseName ${phaseId} but no matching List item was found.`);
        continue;
      }

      // If status is different from phaseName, update it
      if (project.status !== phaseName) {
        await epicCollection.updateOne(
          { _id: project._id },
          { 
            $set: { 
              status: phaseName,
              _updatedBy: 'migration-PUBLIC-126'
            } 
          }
        );
        updatedCount++;
      }
    }

    console.log(`Successfully migrated ${updatedCount} projects to use phase-derived status string.`);
  },

  async down(db, client) {
    console.log('Down migration: No-op. Status synchronization is permanent and dynamic.');
  }
};
