'use strict';

const { ObjectId } = require('mongodb');

const MAPPINGS = [
  { id: 129, epic_guid: '588510b0aaecd9001b8142a1' },
  { id: 130, epic_guid: '588510b0aaecd9001b8142a2' },
  { id: 131, epic_guid: '588510b0aaecd9001b8142a3' },
  { id: 132, epic_guid: '588510b0aaecd9001b8142a4' }
];

module.exports = {
  async up(db, client) {
    const epicCollection = db.collection('epic');

    for (const map of MAPPINGS) {
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
