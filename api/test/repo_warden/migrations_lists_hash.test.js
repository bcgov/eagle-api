'use strict';
const Promise = require('bluebird');
Promise.config({
    warnings: false,
    longStackTraces: true,
    cancellation: false,
    monitoring: false,
    asyncHooks: false,
});
const { hashElement } = require('folder-hash');
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const diff = require('jest-diff');
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

const stringify_replacer = null;
const stringify_space = 2;

const options = {
  folders: {
    include: ['./migrations_data', './api/test/factories/list_factory.js']
    , exclude: ['.*'] },
  files: {
    include: ['*.js'] }
};

function getLastGoodHashsetFromFile() {
  return new Promise(resolve => {
    let filename = './api/test/repo_warden/migrations_lists_hash.json';
    let fileContents = '';
    fs.readFileSync(filename).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; });
    resolve(fileContents);
  });
}

function filterRelevantFolders(rootFolder) {
  let lists = '';
  let list_factory = '';
  rootFolder.children.forEach(function(rootSubfolder) {
    switch(rootSubfolder.name) {
    case 'migrations_data':
      rootSubfolder.children.forEach(function(migrations_data_folder) {
        if ('lists' == migrations_data_folder.name) {
          lists = migrations_data_folder.children;
        }
      });
      break;
    case 'api':
      rootSubfolder.children.forEach(function(apiSubfolder) {
        if ('test' == apiSubfolder.name) {
          apiSubfolder.children.forEach(function(testSubfolder) {
            if ('factories' == testSubfolder.name) {
              testSubfolder.children.forEach(function(factoriesItem) {
                if ('list_factory.js' == factoriesItem.name) {
                  list_factory = factoriesItem;
                }
              });
            }
          });
        }
      });
      break;
    default:
      // try next
    }
  });

  return JSON.stringify({ lists: lists, list_factory: list_factory }, stringify_replacer, stringify_space);
}


const hintMsg = `
/* 
* Hello.  Looks like you're here because the lists or list_factory were changed by some of your work.
*
* The lists in the migrations_data/lists folder are consumed by both the migrations and the data generators.
* In order for everything to work smoothly, we need to have consistency in the formatting and naming of the
* lists files.
* 
* Steps to resolve:
* 
* 1. Review your migration_data/lists changes
* 2. Modify the lists in ./migration_data/lists so that they have only one array each and
*    so that they start with a valid 'YYYYMMDDHHmmss-' prefix like the other files as they are sorted
*    in descending chronological order when used by the lists factory.
* 3. Run this test locally from project folder ./
*      node_modules/.bin/jest ./api/test/repo_warden/migrations_lists_integrity_check.test.js
* 4. Open ./api/test/repo_warden/migrations_lists_hash.json
* 5. Look at the contents, clear them and then copy-paste your output from step 3 into the file
* 6. Re-run step 3 and make any fixes until the test passes
* 7. Commit and update your PR
*
*/`;

describe('Catch Poorly Written List Migration Data', () => {
  describe('Check Migrations Data Lists', () => {
    // run this test in a separate test because it extends the expect function
    test('Check for that when lists are updated, so is the lists_factory', done => {
      // if you only changed the list factory, please just update the hash and carry on
      getLastGoodHashsetFromFile().then(lastGoodMigrationsDataListsFolderHashset => {
        hashElement('./', options).then(currentMigrationsDataFolderHashset => {
          currentMigrationsDataFolderHashset = filterRelevantFolders(currentMigrationsDataFolderHashset);
          expect.extend({
            toEqual(received, expected) {
              const pass = _.isEqual(received, expected);
              const message = pass
                ? () => this.utils.matcherHint('toEqual', undefined, undefined)
                : () => {
                  const diffString = diff(expected, received, {
                    expand: this.expand,
                  });
                  return (
                    '\n\n' + hintMsg + '\n\n' +
                                '************** Current Hashset Start **************\n' +
                                currentMigrationsDataFolderHashset + '\n' +
                                '************** Current Hashset End **************\n' +
                                'Difference:\n\n' + diffString);
                };
              return {actual: received, message, pass};
            },
          });

          let currentHashset = JSON.parse(currentMigrationsDataFolderHashset);
          let lastGoodHashset = JSON.parse(lastGoodMigrationsDataListsFolderHashset);
          expect(currentHashset.lists).toEqual(lastGoodHashset.lists);
          expect(currentHashset.list_factory).toEqual(lastGoodHashset.list_factory);
          done();
        });
      });
    }, 60000);
  });
});
