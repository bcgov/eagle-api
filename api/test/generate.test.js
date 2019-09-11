'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird'); // for extra debugging capabilities
//mongoose.Promise = global.Promise;  // without debugging extras
require('../helpers/models/audit');
const request = require('supertest');
const nock = require('nock');
const _ = require('lodash');
const auditFactory = require("./factories/audit_factory").factory;
const projectFactory = require("./factories/project_factory").factory;
const userFactory = require("./factories/user_factory").factory;
require('../helpers/models/user');
const User = mongoose.model('User');
require('../helpers/models/project');
const Project = mongoose.model('Project');
const readline = require('readline');
const fs = require('fs');
const defaultNumberOfProjects = 1;

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

function getGenNumFromFile() {
  return new Promise(resolve => {
    let filename = './generate_num.config';
    
    const readInterface = readline.createInterface({
      input: fs.createReadStream(filename),
      output: null,
      console: false
    });
    readInterface.on('line', (line) => {
      resolve(line);
      readInterface.close();
    });
  });   
};

function setupProjects(usersData) {
  return new Promise(function(resolve, reject) {
    getGenNumFromFile().then(num => {
      let numOfProjsToGen = Number(num);
      let numOfProjsGenned = 0;
      if (isNaN(numOfProjsToGen)) numOfProjsToGen = defaultNumberOfProjects;
      console.log('Generating ' + numOfProjsToGen + ' projects.');
      auditFactory.create('audit').then(audit =>{
        userFactory.createMany('user', usersData).then(usersArray => {
          projectFactory.createMany('project', numOfProjsToGen).then(projectsArray => {
            numOfProjsGenned = projectsArray.length;
            let generatedData = [usersArray, audit, projectsArray];
            resolve(generatedData);
          }).catch(error => {
            console.log("project error:" + error);
            reject(error);
          }).finally(function(){
            console.log('Generated ' + numOfProjsGenned + ' projects.');
          });
        });
      });
    });
  });
};

describe('Generate Test Data', () => {
  const usersData = [
    {
      username: 'admin1', displayName: 'Mr Admin', password: 'v3rys3cr3t', roles: ['sysadmin', 'public']
    },
    {
      username: 'joeschmo1', displayName: 'Joe Schmo', password: 'n0ts3cr3t', roles: ['public']
    }
  ];

  describe('Generate Projects', () => {
    test('Generator', done => {
      setupProjects(usersData).then(generatedData =>{
        let projects = generatedData[2];
        asyncForEach(projects, async (project) =>{
          console.log('Project [id, name]: [' + project._id + ', ' + project.name + ']');
          expect(project._id).toEqual(jasmine.any(Object));
          expect(project.name).toEqual("test");
          done();
        });
      });
    });
  });

});
