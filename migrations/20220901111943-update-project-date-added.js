'use strict';

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function (db) {
  let mClient;

  return db.connection
    .connect(db.connectionString, { native_parser: true })
    .then(async client => {
      const updatePromises = [];
      mClient = client;

      const collection = mClient.collection('epic');

      // Get all projects.
      debugger;
      const projects = await collection.aggregate([{ $match: { _schemaName: 'Project' } }]).toArray();

      projects.forEach(project => {
        switch (project.currentLegislationYear) {
          case 'legislation_1996':
            if (project.legislation_1996.dateAdded !== null && project.legislation_1996.dateAdded !== '') {
              updatePromises.push(
                collection.update(
                  { _id: project._id },
                  {
                    $set: {
                      'legislation_1996.dateAdded': new Date(project.legislation_1996.dateAdded).toISOString()
                    }
                  }
                )
              );
            }
            break;
          case 'legislation_2002':
            if (project.legislation_2002.dateAdded !== null && project.legislation_2002.dateAdded !== '') {
              updatePromises.push(
                collection.update(
                  { _id: project._id },
                  {
                    $set: {
                      'legislation_2002.dateAdded': new Date(project.legislation_2002.dateAdded).toISOString()
                    }
                  }
                )
              );
            }
            break;
          case 'legislation_2018':
            if (project.legislation_2018.dateAdded !== null && project.legislation_2018.dateAdded !== '') {
              updatePromises.push(
                collection.update(
                  { _id: project._id },
                  {
                    $set: {
                      'legislation_2018.dateAdded': new Date(project.legislation_2018.dateAdded).toISOString()
                    }
                  }
                )
              );
            }
            break;
        }
      });

      // Wait for all promises to resolve before closing the DB connection.
      await Promise.all(updatePromises);

      mClient.close();
    })
    .catch(e => {
      console.log('e:', e);
      mClient.close();
    });
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  version: 1
};
