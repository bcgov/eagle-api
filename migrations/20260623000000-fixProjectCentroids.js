'use strict';

module.exports = {
  async up(db, client) {
    const epicCol = db.collection('epic');
    const projects = await epicCol.find({ _schemaName: "Project" }).toArray();

    for (let project of projects) {
      const legislations = ['legislation_1996', 'legislation_2002', 'legislation_2018'];
      let changed = false;
      const $set = {};

      for (const leg of legislations) {
        if (project[leg] && project[leg].centroid && project[leg].centroid.length === 2) {
          let lon = Number(project[leg].centroid[0]);
          let lat = Number(project[leg].centroid[1]);

          // If original data wasn't already numbers, we should update it
          if (typeof project[leg].centroid[0] !== 'number' || typeof project[leg].centroid[1] !== 'number') {
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
              $set[`${leg}.centroid`] = [lon, lat];
            }
          }
        }
      }

      if (changed && Object.keys($set).length > 0) {
        await epicCol.updateOne(
          { _id: project._id },
          { $set }
        );
      }
    }
  },

  async down(db, client) {
    return null;
  }
};
