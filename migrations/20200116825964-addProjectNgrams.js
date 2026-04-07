'use strict';



// Maximum number of words to create search terms for in a project's name.
const WORDS_TO_ANALYZE = 3;

module.exports = {
  async up(db, client) {
    let mClient;

    return db.connection.connect(db.connectionString, { native_parser: true })
      .then(async (client) => {
        const updatePromises = [];
        mClient = client;

        const collection = db.collection('epic');

        // Get all projects.
        const projects = await collection.aggregate([
          { $match: { _schemaName: 'Project' } }
        ])
        .toArray();

        projects.forEach(project => {
          if (project.legislation_1996) {
            const searchTerms = generateSearchTerms(project.legislation_1996.name, WORDS_TO_ANALYZE);

            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_1996.nameSearchTerms': searchTerms,
                  }
                }
              )
            );
          }

          if (project.legislation_2002) {
            const searchTerms = generateSearchTerms(project.legislation_2002.name, WORDS_TO_ANALYZE);

            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_2002.nameSearchTerms': searchTerms,
                  }
                }
              )
            );
          }

          if (project.legislation_2018) {
            const searchTerms = generateSearchTerms(project.legislation_2018.name, WORDS_TO_ANALYZE);

            updatePromises.push(
              collection.update(
                {
                  _id: project._id
                },
                {
                  $set: {
                    'legislation_2018.nameSearchTerms': searchTerms,
                  }
                }
              )
            );
          }
        });

        // Wait for all promises to resolve before closing the DB connection.
        await Promise.all(updatePromises);

      })
      .catch((e) => {
        console.log('e:', e);
      });
  },

  async down(db, client) {
    return null;
  }
};
