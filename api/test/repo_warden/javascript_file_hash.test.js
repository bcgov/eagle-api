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
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

const stringify_replacer = null;
const stringify_space = 2;

const options = {
  folders: {
    include: ['./', './*', 'openshift', 'openshift/templates', 'uploads']
    , exclude: ['.*', 'api', 'config', 'migrations', 'migrations_data', 'migrations_temp', 'node_modules'] },
  files: {
    include: ['*.js']
    , exclude: ['.*', 'app_helper.js', 'app.js', 'jest.config.js'] }
};

function getLastGoodHashsetFromFile() {
  return new Promise(resolve => {
    let filename = './api/test/repo_warden/javascript_file_hash.json';
    let fileContents = '';
    fs.readFileSync(filename).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; });
    resolve(fileContents);
  });
}

function filterRelevantFolders(rootFolder) {
  const rootJsFiles = Object.assign({}, rootFolder.children.filter(item => (item.name.endsWith('.js'))));
  defaultLog.debug(rootJsFiles);
  let one_off_migrationsJsFiles = {};
  let openshiftJsFiles = {};
  let templatesJsFiles = {};
  let uploadsJsFiles = {};

  rootFolder.children.forEach(function(rootSubfolder) {
    switch(rootSubfolder.name) {
    case 'one_off_migrations':
      one_off_migrationsJsFiles = Object.assign({}, rootSubfolder.children.filter(item => (item.name.endsWith('.js'))));
      break;
    case 'openshift':
      openshiftJsFiles = Object.assign({}, rootSubfolder.children.filter(item => (item.name.endsWith('.js'))));
      rootSubfolder.children.forEach(function(templatesFolder) {
        if ('templates' == templatesFolder.name) {
          templatesJsFiles = Object.assign({}, templatesFolder.children.filter(item => (item.name.endsWith('.js'))));
        }
      });
      break;
    case 'uploads':
      uploadsJsFiles = Object.assign({}, rootSubfolder.children.filter(item => (item.name.endsWith('.js'))));
      break;
    default:
      // try next
    }
  });

  const hashPackage = {
    rootJsFiles: rootJsFiles
    , one_off_migrationsJsFiles: one_off_migrationsJsFiles  // TODO: get rid of this folder entirely.  It smells.  A one off migration is just a migration.
    , openshiftJsFiles: openshiftJsFiles
    , templatesJsFiles: templatesJsFiles
    , uploadsJsFiles: uploadsJsFiles
  };
  return JSON.stringify(hashPackage, stringify_replacer, stringify_space);
}


const hintMsg = `
/* 
* Hello.  Looks like you're here because you've introduced some javascript files in questionable locations.
*
* The API project needs to be kept tidy.  Think hard about if your newly introduced js file is in the right place.
* If you're 100% certain you intend to go down in Git history as placing the file where it is, update the above 
* exclusion definitions and proceed with the following steps.
* 
* Steps to resolve:
* 
* 1. Review your js file changes
* 2. Run this test locally from project folder ./
*      node_modules/.bin/jest ./api/test/repo_warden/javascript_file_hash.test.js
* 3. Open ./api/test/repo_warden/javascript_file_hash.json
* 4. Look at the contents, clear them and then copy-paste your output from step 2 into the file
* 5. Re-run step 2 and make any fixes until the test passes
* 6. Commit and update your PR
*
*/`;

describe('Catch project file tree for javascript file in questionable locations', () => {
  describe('Check javascript files', () => {
    test('Detect Changes', done => {
      getLastGoodHashsetFromFile().then(lastGoodJavascriptFileHashset => {
        hashElement('./', options).then(currentJavascriptFileHashset => {
          currentJavascriptFileHashset = filterRelevantFolders(currentJavascriptFileHashset);
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
                                currentJavascriptFileHashset + '\n' +
                                '************** Current Hashset End **************\n' +
                                'Difference:\n\n' + diffString);
                };
              return {actual: received, message, pass};
            },
          });
          let currentHashset = JSON.parse(currentJavascriptFileHashset);
          let lastGoodHashset = JSON.parse(lastGoodJavascriptFileHashset);
          expect(currentHashset.rootJsFiles).toEqual(lastGoodHashset.rootJsFiles);
          expect(currentHashset.one_off_migrationsJsFiles).toEqual(lastGoodHashset.one_off_migrationsJsFiles);
          expect(currentHashset.openshiftJsFiles).toEqual(lastGoodHashset.openshiftJsFiles);
          expect(currentHashset.templatesJsFiles).toEqual(lastGoodHashset.templatesJsFiles);
          expect(currentHashset.uploadsJsFiles).toEqual(lastGoodHashset.uploadsJsFiles);
          done();
        });
      });
    });
  });
});
