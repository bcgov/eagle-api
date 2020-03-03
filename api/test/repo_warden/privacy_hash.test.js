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
const hash_helper = require('./hash_helper');
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

const stringify_replacer = null;
const stringify_space = 2;

const options = {
  folders: {
    include: [ /* all */ ]
    , exclude: ['.*', 'openshift', 'node_modules', 'api/test'] },
  files: {
    include: ['*.json', '*.dump', '*.dump.tar.gz']
    , exclude: [
         '.*', '.eslintrc.json', 'database.json', 'package-lock.json', 'package.json'
        , 'javascript_file_hash.json', 'migrations_lists_hash.json'
        , 'model_vs_factory_hash.json', 'privacy_hash.json'] }
};

function getLastGoodHashsetFromFile() {
  return new Promise(resolve => {
    let filename = './api/test/repo_warden/privacy_hash.json';
    let fileContents = '';
    fs.readFileSync(filename).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; });
    resolve(fileContents);
  });
}

function filterRelevantFolders(rootFolder) {
  let filteredHashArray = [];
  filteredHashArray = hash_helper.findObjectsByEnding(rootFolder, '.json', filteredHashArray);
  defaultLog.debug(filteredHashArray);
  return JSON.stringify(Object.assign({}, filteredHashArray), stringify_replacer, stringify_space);
}


const hintMsg = `
/* 
* Hello.  Looks like you're here because you've introduced some questionable data files.  This is a high priority PRIVACY CONCERN!
*
* EPIC production data must be kept out of our repos at all cost.  If you are encountering this message locally, please remove any
* data containing personal information or confidential information.  For example, comments, comment meta data, 
* inspections, inspections metadata, users, user info, and unpublished items of any kind like documents, projects or
* comment periods can all contain information that can constitute a breach. Take the time to be careful.
*
* If you are encountering this message in the pipeline, you have a PRIVACY BREACH on your hands.
* Please call 77000 immediately and use the menu options to report the breach.
* 
* If you have a legitimate reason for committing a data file (be skepitical) then follow the steps below.
* 
* Steps to resolve:
* 
* 1. Review your json file changes
* 2. Run this test locally from project folder ./
*      node_modules/.bin/jest ./api/test/repo_warden/privacy_hash.test.js
* 3. Open ./api/test/repo_warden/privacy_hash.json
* 4. Look at the contents, clear them and then copy-paste your output from step 2 into the file
* 5. Re-run step 2 and make any fixes until the test passes
* 6. Commit and update your PR
*
*/`;

describe('Catch project file tree for javascript file in questionable locations', () => {
  describe('Check javascript files', () => {
    test('Detect Changes', done => {
      getLastGoodHashsetFromFile().then(lastGoodJsonFileHashset => {
        hashElement('.', options).then(currentJsonFileHashset => {
          currentJsonFileHashset = filterRelevantFolders(currentJsonFileHashset);
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
                                currentJsonFileHashset + '\n' +
                                '************** Current Hashset End **************\n' +
                                'Difference:\n\n' + diffString);
                };
              return {actual: received, message, pass};
            },
          });
          let currentHashset = JSON.parse(currentJsonFileHashset);
          let lastGoodHashset = JSON.parse(lastGoodJsonFileHashset);
          expect(currentHashset).toEqual(lastGoodHashset);
          done();
        });
      });
    });
  });
});
