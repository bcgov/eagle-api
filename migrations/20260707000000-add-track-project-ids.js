'use strict';

const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

module.exports = {
  async up(db, client) {
    const mappingsPath = path.join(__dirname, '../migrations_data/track_project_mappings.json');
    if (!fs.existsSync(mappingsPath)) {
      console.log('Mappings file not found at:', mappingsPath);
      return;
    }

    const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    const epicCollection = db.collection('epic');

    for (const map of mappings) {
      if (!map.epic_guid || !map.id) continue;
      
      try {
        const objId = new ObjectId(map.epic_guid);
        const result = await epicCollection.updateOne(
          { _schemaName: 'Project', _id: objId },
          { $set: { trackProjectId: Number(map.id) } }
        );
        if (result.matchedCount > 0) {
          console.log(`Mapped project ${map.epic_guid} to trackProjectId ${map.id}`);
        }
      } catch (err) {
        console.error(`Failed to map project ${map.epic_guid}:`, err.message);
      }
    }
  },

  async down(db, client) {
    const epicCollection = db.collection('epic');
    await epicCollection.updateMany(
      { _schemaName: 'Project' },
      { $unset: { trackProjectId: "" } }
    );
    console.log('Reverted trackProjectId mapping on all projects.');
  }
};
