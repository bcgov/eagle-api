'use strict';
const app_helper = require('../../../app_helper');
const Promise = require("bluebird");
Promise.config({
  warnings: false,
  longStackTraces: true,
  cancellation: false,
  monitoring: false,
  asyncHooks: false,
});
const test_helper = require('../test_helper');
const factory_helper = require('../factories/factory_helper');
const mongoose = require('mongoose');
const request = require('supertest');
const nock = require('nock');
const gh = require("./generate_helper");
let defaultLog = app_helper.defaultLog;

describe('Generate Test Data', () => {
  let adminUser = factory_helper.generateFakePerson('Stanley', '', 'Adminington');
  let publicUser = factory_helper.generateFakePerson('Joe', '', 'Schmo');
  const usersData = [
      {firstName: adminUser.firstName, middleName: adminUser.middleName, lastName: adminUser.lastName, displayName: adminUser.fullName, email: adminUser.emailAddress, read: adminUser.read, write: adminUser.write, delete: adminUser.delete}
    , {firstName: publicUser.firstName, middleName: publicUser.middleName, lastName: publicUser.lastName, displayName: publicUser.fullName, email: publicUser.emailAddress, read: publicUser.read, write: publicUser.write, delete: publicUser.delete}
  ];

  describe('Generate Projects', () => {
    test('Generator', async done => {
    mongoose.connection.db.collection('epic').count((error, recordCount) => {
      test_helper.dataGenerationSettings.then(genSettings => {
        defaultLog.debug(genSettings);
        // Eaxample basic usage from project base dir: 
        //     ./generate.sh 10 Static Unsaved
        //     ./generate.sh 3 Random Saved
        // or you can just set the following environment variable:
        //     export GENERATE_ON=true
        // and run:
        //     npm run tests
        // and it will run a coverage test using settings 1 Static Unsaved
        if (genSettings.generate) {
          defaultLog.info("Data Generation is on");

          // This is a fail safe to prevent data being generated on collections that have data if not explicitly set in the command.
          if (recordCount && genSettings.single_db_pass) {
            defaultLog.error(`Collection must be empty to generate data or the command must be run with the 'Multiple' flag set. There are currently ${recordCount} documents in the collection`);
            done();
            return;
          }

          gh.generateEntireDatabase(usersData).then(generatedData => {
            defaultLog.info(((genSettings.generate_consistent_data) ? "Consistent" : "Random") + " data generation " + ((genSettings.save_to_persistent_mongo) ? "saved" : "unsaved"));
            let projects = generatedData.projects;
            defaultLog.debug('projects: [' + projects + ']');
            let documents = generatedData.projectDocuments;

            if (0 == projects.length) {
              expect(1).toEqual(1);
              done();
            }
            
            generatedData.report();
            projects.map((project) => {
              defaultLog.verbose('Project [id, name]: [' + project._id + ', ' + project.name + ']');
              expect(project._id).toEqual(jasmine.any(Object));
              expect(project.write[0]).toEqual("sysadmin");
              defaultLog.debug("total documents.length = " + documents.length);
              if (0 < documents.length) {
                const projectDocuments = documents.filter(document => document.project == project._id);
                defaultLog.debug("projectDocuments.length = " + projectDocuments.length);
                projectDocuments.map((p_document) => {
                  defaultLog.debug('document: [' + document + ']');
                  defaultLog.verbose('Document [id, project, documentFileName]: [' + p_document._id + ', ' + p_document.project + ', ' + p_document.documentFileName + ']');
                });
              }
              done();
            });
          });
        } else {
          defaultLog.info("Data Generation is off");
          expect(1).toEqual(1);
          done();
        }
      });
     });
    });
  });
});
