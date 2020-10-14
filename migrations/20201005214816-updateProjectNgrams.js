'use strict';

const mongoose = require('mongoose');

let dbm;
let type;
let seed;

// Maximum number of words to create search terms for in a project's name.
const WORDS_TO_ANALYZE = 7;

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

  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(async (client) => {
      const updatePromises = [];
      mClient = client;
      
      const collection = mClient.collection('epic');

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

// Generates all unique search terms up to a word limit.
const generateSearchTerms = (name, maxWordLimit) => {
  if (!name) {
    return;
  }

  let searchTerms = []

  // Split the name into words.
  const words = name.trim().split(/[\s\-/]+/);
  const wordLimit = words.length < maxWordLimit ? words.length : maxWordLimit;

  for (let i = 0; i < wordLimit; i++) {
    const wordTerms = getWordSearchTerms(words[i]);
    searchTerms = [...searchTerms, ...wordTerms];
  }

  // Remove any duplicate terms by casting to a set and then back to an array.
  const filteredTerms = [... new Set(searchTerms)];
  
  return filteredTerms;
}

// Gets all search terms for a single word.
const getWordSearchTerms = (word) => {
  const searchTerms = [];

  // Start terms at 2 letters in length. Do not want to search on single letter.
  for (let i = 2; i <= word.length; i++) {
    searchTerms.push(word.substring(0, i));
  }

  return searchTerms;
}
