'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
const factory_helper = require('./factories/factory_helper');
const request = require('supertest');
const nock = require('nock');

const generate_helper = require("./generate_helper");

generate_helper.getGenSettingsFromFile().then(genSettingsFromFile => {
  generate_helper.genSettings = genSettingsFromFile;
  test_helper.usePersistentMongoInstance = generate_helper.genSettings.save_to_persistent_mongo;
  //console.log(generate_helper.genSettings);
});

describe('Generate Test Data', () => {
  let adminUser = factory_helper.generateFakePerson('Stanley', '', 'Adminington');
  let publicUser = factory_helper.generateFakePerson('Joe', '', 'Schmo');
  const usersData = [
      {firstName: adminUser.firstName, middleName: adminUser.middleName, lastName: adminUser.lastName, displayName: adminUser.fullName, email: adminUser.emailAddress, read: adminUser.read, write: adminUser.write, delete: adminUser.delete}
    , {firstName: publicUser.firstName, middleName: publicUser.middleName, lastName: publicUser.lastName, displayName: publicUser.fullName, email: publicUser.emailAddress, read: publicUser.read, write: publicUser.write, delete: publicUser.delete}
  ];

  describe('Generate Projects', () => {
    test('Generator', done => {
        //console.log(generate_helper.genSettings);

        // Default is to not run the data generator when running global tests
        if (generate_helper.genSettings.generate) {
          console.log("Data Generation is on");
          generate_helper.generateAll(usersData).then(generatedData =>{
            console.log(((generate_helper.genSettings.generate_consistent_data) ? "Consistent" : "Random") + " data generation " + ((generate_helper.genSettings.save_to_persistent_mongo) ? "saved" : "unsaved"));
            //console.log('generatedData: [' + generatedData + ']');
            let projects = generatedData[2];
           console.log('projects: [' + projects + ']');
  
            // throw projects
            projects.map((project) => {
              console.log('Project [id, name]: [' + project._id + ', ' + project.name + ']');
              //console.log('        [shortName, dateAdded, dateUpdated]: [' + project.shortName + ', ' + project.dateAdded + ',' + project.dateUpdated + ']');
              //console.log('        [projectLead, projectLeadEmail]: [' + project.projectLead + ', ' + project.projectLeadEmail + ']');
              expect(project._id).toEqual(jasmine.any(Object));
              expect(project.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
              //TODO:: Check the outputted data against the database model
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
