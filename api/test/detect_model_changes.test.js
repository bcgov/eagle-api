'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const { hashElement } = require('folder-hash');
const _ = require('lodash');
const fs = require('fs');

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
      let filename = './api/test/model_change_watcher_hash.json';
      let fileContents = "";
      fs.readFileSync(filename).toString().split('\n').forEach(function (line) { fileContents = fileContents + line; })
      resolve(fileContents);
    });   
  };

function filterRelevantFolders(apiFolderJsonObj) {
    let models = "";
    let factories = "";
    apiFolderJsonObj.children.forEach(function(apiSubfolder) {
        switch(apiSubfolder.name) {
            case "helpers":
                apiSubfolder.children.forEach(function(helpersSubfolder) {
                    if ("models" == helpersSubfolder.name) {
                        models = helpersSubfolder.children;
                    }
                });
              break;
            case "test":
                apiSubfolder.children.forEach(function(testSubfolder) {
                    if ("factories" == testSubfolder.name) {
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
 *      node_modules/.bin/jest ./api/test/detect_model_changes.test.js
 * 4. Open ./api/test/model_change_watcher_hash.json
 * 5. Look at the contents, clear them and then copy-paste your output from step 3 into the file
 * 6. Commit and update your PR
 *
 */

describe('Catch Model Changes not done in Factories', () => {
    describe('Check Models & Factories', () => {
        test('Detect Changes', done => {
            getLastGoodHashsetFromFile().then(lastGoodApiFolderHashset => {
                hashElement('./api', options).then(currentApiFolderHashset => {
                    
                    currentApiFolderHashset = filterRelevantFolders(currentApiFolderHashset);
                    console.log("************** Start snip **************");
                    console.log(currentApiFolderHashset);
                    console.log("************** End snip **************");
                    expect(currentApiFolderHashset.models).toEqual(lastGoodApiFolderHashset.models);
                    expect(currentApiFolderHashset.factories).toEqual(lastGoodApiFolderHashset.factories);
                    done();
                })
                .catch(error => {
                    return console.error('hashing failed:', error);
                });            
            });
        });
    });
});

