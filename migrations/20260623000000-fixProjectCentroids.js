'use strict';

module.exports = {
  async up(db, client) {
    const epicCol = db.collection('epic');
    const projects = await epicCol.find({ _schemaName: "Project" }).toArray();

    for (let project of projects) {
      if (project.centroid && project.centroid.length === 2) {
        let lon = Number(project.centroid[0]);
        let lat = Number(project.centroid[1]);
        let changed = false;

        // If original data wasn't already numbers, we should update it
        if (typeof project.centroid[0] !== 'number' || typeof project.centroid[1] !== 'number') {
          changed = true;
        }

        if (!isNaN(lon) && !isNaN(lat)) {
          // Auto-correct swapped coordinates
          if (Math.abs(lon) < 90 && Math.abs(lat) > 90) {
            const temp = lon;
            lon = lat;
            lat = temp;
            changed = true;
          }

          // Auto-correct positive longitudes
          if (lon > 0) {
            lon = -lon;
            changed = true;
          }

          if (changed) {
            await epicCol.updateOne(
              { _id: project._id },
              { $set: { centroid: [lon, lat] } }
            );
          }
        }
      }
    }
  },

  async down(db, client) {
    return null;
  }
};
