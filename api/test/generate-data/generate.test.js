'use strict';
const jasmine = require('jasmine')
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('../test_helper');
const factory_helper = require('./factories/factory_helper');
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
  
            projects.map((project) => {
              expect(project._id).toEqual(jasmine.any(Object));
              switch (project.currentLegislationYear) {
                case "1996":
                  console.log('Project [id, name]: [' + project._id + ', ' + project.legislation_1996.name + ']');
                  expect(project.legislation_1996.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                  break;
                case "2002":
                  console.log('Project [id, name]: [' + project._id + ', ' + project.legislation_2002.name + ']');
                  expect(project.legislation_2002.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                  break;
                case "2018":
                  console.log('Project [id, name]: [' + project._id + ', ' + project.legislation_2018.name + ']');
                  expect(project.legislation_2018.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                  break;
                default:
                  expect(project.CELeadEmail).toEqual("legislation not set properly");  // this will fail
              }
              
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
