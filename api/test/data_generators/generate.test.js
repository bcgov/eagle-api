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
    test('Generator', done => {
      test_helper.dataGenerationSettings.then(genSettings => {
        defaultLog.debug(genSettings);

        // Default is to not run the data generator when running global tests
        if (genSettings.generate) {
          defaultLog.info("Data Generation is on");
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
