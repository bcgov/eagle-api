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
const diff = require('jest-diff');

const stringify_replacer = null;
const stringify_space = 2;

const options = {
  folders: {
    include: ['./api/helpers/models', './api/test/factories']
    , exclude: ['.*', 'controllers', 'fixtures'] },
  files: {
    include: ['*.js']
    , exclude: ['*_helper.js', '*.json'] }
};

function getLastGoodHashsetFromFile() {
  return new Promise(resolve => {
    let filename = './api/test/repo_warden/model_vs_factory_hash.json';
    let fileContents = '';
    fs.readFileSync(filename).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; });
    resolve(fileContents);
  });
}

function filterRelevantFolders(apiFolderJsonObj) {
  let models = {};
  let factories = {};
  apiFolderJsonObj.children.forEach(function(apiSubfolder) {
    switch(apiSubfolder.name) {
    case 'helpers':
      apiSubfolder.children.forEach(function(helpersSubfolder) {
        if ('models' == helpersSubfolder.name) {
          models = helpersSubfolder.children;
        }
      });
      break;
    case 'test':
      apiSubfolder.children.forEach(function(testSubfolder) {
        if ('factories' == testSubfolder.name) {
          factories = testSubfolder.children;
        }
      });
      break;
    default:
      // try next
    }
  });
  return JSON.stringify({ models: models, factories: factories }, stringify_replacer, stringify_space);
}


const hintMsg = `
/* 
* Hello.  Looks like you're here because the models were changed by some of your work.
*
* The API project is in early days testing-wise, so it is largely uncovered by automation compared to 
* the original project PRC from which this was forked.  Since we don't have real tests covering the models,
* this test is here to remind you to keep the data generators in sync.
* 
* Steps to resolve:
* 
* 1. Review your model changes
* 2. Modify the data generators in ./api/test/factories with realistic looking data following the 
*    existing data generation patterns.
* 3. Run this test locally from project folder ./
*      node_modules/.bin/jest ./api/test/repo_warden/model_vs_factory_hash.test.js
* 4. Open ./api/test/repo_warden/model_vs_factory_hash.json
* 5. Look at the contents, clear them and then copy-paste your output from step 3 into the file
* 6. Re-run step 3 and make any fixes until the test passes
* 7. Commit and update your PR
*
*/`;

describe('Catch Model Changes not done in Factories', () => {
  describe('Check Models & Factories', () => {
    test('Detect Changes', done => {
      getLastGoodHashsetFromFile().then(lastGoodApiFolderHashset => {
        hashElement('./api', options).then(currentApiFolderHashset => {
          currentApiFolderHashset = filterRelevantFolders(currentApiFolderHashset);
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
                                currentApiFolderHashset + '\n' +
                                '************** Current Hashset End **************\n' +
                                'Difference:\n\n' + diffString);
                };
              return {actual: received, message, pass};
            },
          });

          let currentHashset = JSON.parse(currentApiFolderHashset);
          let lastGoodHashset = JSON.parse(lastGoodApiFolderHashset);
          expect(currentHashset.models).toEqual(lastGoodHashset.models);
          expect(currentHashset.factories).toEqual(lastGoodHashset.factories);
          done();
        });
      });
    });
  });
});
