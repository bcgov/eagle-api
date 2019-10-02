'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
const factory_helper = require('./factories/factory_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird'); // for extra debugging capabilities
//mongoose.Promise = global.Promise;  // without debugging extras
require('../helpers/models/audit');
const faker = require('faker');
const Chance = require('chance');
const request = require('supertest');
const nock = require('nock');
const _ = require('lodash');

const generate_helper = require("./generate_helper");

const deterministicSeed = 123;

let generateConsistentData = true;
if (generateConsistentData) {
  faker.seed(deterministicSeed);  // faker for input arrays and moustache notation
  Chance(deterministicSeed);  // chance for the breadth of available generators
}

describe('Generate Test Data', () => {
  let adminUser = factory_helper.generateFakePerson('Stanley', '', 'Adminington');
  let publicUser = factory_helper.generateFakePerson('Joe', '', 'Schmo');
  const usersData = [
      {firstName: adminUser.firstName, middleName: adminUser.middleName, lastName: adminUser.lastName, displayName: adminUser.fullName, email: adminUser.emailAddress, read: adminUser.read, write: adminUser.write, delete: adminUser.delete}
    , {firstName: publicUser.firstName, middleName: publicUser.middleName, lastName: publicUser.lastName, displayName: publicUser.fullName, email: publicUser.emailAddress, read: publicUser.read, write: publicUser.write, delete: publicUser.delete}
  ];

  // Trigger the data generation, then use the variable we made as we generated the data
  // to double check the data in the (in-memory or real) database
  describe('Generate Projects', () => {
    test('Generator', done => {
      generate_helper.generateAll(usersData).then(generatedData =>{
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
    });
  });

});
