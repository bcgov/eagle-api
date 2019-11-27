'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
const factory_helper = require('./factories/factory_helper');
const request = require('supertest');
const nock = require('nock');
const generate_helper = require("./generate_helper");
const gh = generate_helper; // shorthand alias for brevity

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
        //console.log(genSettings);

        // Default is to not run the data generator when running global tests
        if (genSettings.generate) {
          console.log("Data Generation is on");
          gh.generateEntireDatabase(usersData).then(generatedData =>{
            console.log(((genSettings.generate_consistent_data) ? "Consistent" : "Random") + " data generation " + ((genSettings.save_to_persistent_mongo) ? "saved" : "unsaved"));
            //console.log('generatedData: [' + generatedData + ']');
            let projects = generatedData.projects;
            console.log('projects: [' + projects + ']');
  
            // throw projects
            projects.map((project) => {
              console.log('Project [id, name]: [' + project._id + ', ' + project.name + ']');
              //console.log('        [shortName, dateAdded, dateUpdated]: [' + project.shortName + ', ' + project.dateAdded + ',' + project.dateUpdated + ']');
              //console.log('        [projectLead, projectLeadEmail]: [' + project.projectLead + ', ' + project.projectLeadEmail + ']');
              expect(project._id).toEqual(jasmine.any(Object));
              expect(project.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
              //TODO:: Check the outputted deterministic data fields against the database model.  Some fields will always have randomness so tests will have to be designed around that.
              done();
            });
          });
        } else {
          console.log("Data Generation is off");
          expect(1).toEqual(1);
          done();
        }
      });
    });
  });
});
