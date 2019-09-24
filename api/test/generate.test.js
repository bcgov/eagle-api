'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
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
const auditFactory = require("./factories/audit_factory").factory;
const userFactory = require("./factories/user_factory").factory;
const projectFactory = require("./factories/project_factory").factory;
const commentPeriodFactory = require("./factories/comment_period_factory").factory;
const commentFactory = require("./factories/comment_factory").factory;
require('../helpers/models/user');
const User = mongoose.model('User');
require('../helpers/models/project');
const Project = mongoose.model('Project');
const readline = require('readline');
const fs = require('fs');
const defaultNumberOfProjects = 1;
const deterministicSeed = 123;

let generateConsistentData = true;
if (generateConsistentData) {
  faker.seed(deterministicSeed);  // faker for input arrays and moustache notation
  Chance(deterministicSeed);  // chance for the breadth of available generators
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

// Data generation violates the single purpose principle on purpose.
// It generates data, saves model to db (mem or real), and outputs the data we generated
// so we can check that it got saved properly later and manipulate the data for tests.
// We do this because we are no longer using static seeded data.
function generateAll(usersData) {
  return generateProjects(usersData)
  .then(generatedData => { 
    let projects = generatedData[2];
    return new Promise(function(resolve, reject) {
      generateCommentPeriods(projects).then(commentPeriods => {
        generatedData.push(commentPeriods);
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    let commentPeriods = generatedData[3];
    return new Promise(function(resolve, reject) {
      generateComments(commentPeriods).then(comments => {
        generatedData.push(comments);
        resolve(generatedData);
      });
    });
  });
};

function generateCommentPeriods(projects) {
  return new Promise(function(resolve, reject) {
    projects.map(project => {
      resolve(generateCommentPeriod(project));
    });
  }).catch(error => {
    console.log("Comment periods error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comment periods.');
  });
};


function generateCommentPeriod(project) {
    return new Promise(function(resolve, reject) {

      let commentPeriodsToGen = faker.random.number(2).valueOf();
      
      if (0 < commentPeriodsToGen) {
        commentPeriodFactory.createMany('commentPeriod', commentPeriodsToGen, { project: project._id }).then(commentPeriodsArray => {
          resolve(commentPeriodsArray);
        });
      } else {
        resolve([]);
      }
    }).catch(error => {
      console.log("Comment period error:" + error);
      reject(error);
    }).finally(function(){
      console.log('Generated comment period.');
    });
};

function generateComments(commentPeriods) {
  return new Promise(function(resolve, reject) {
    commentPeriods.map((commentPeriod) => {
      resolve(generateComment(commentPeriod));
    });
  }).catch(error => {
    console.log("Comments error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comments.');
  });
};

function generateComment(commentPeriod) {
  return new Promise(function(resolve, reject) {
    let commentsToGen = faker.random.number(300).valueOf();
    if (0 < commentsToGen) {
      commentFactory.createMany('comment', commentsToGen, { commentPeriod: commentPeriod._id }).then(commentsArray => {
        resolve(commentsArray);
      });
    } else {
      resolve([]);
    }
  }).catch(error => {
    console.log("Comment error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comment.');
  });
};

function generateProjects(usersData) {
  let projectGenerator = new Promise(function(resolve, reject) {
    getGenNumFromFile().then(num => {
      let numOfProjsToGen = Number(num);
      let numOfProjsGenned = 0;
      if (isNaN(numOfProjsToGen)) numOfProjsToGen = defaultNumberOfProjects;
      console.log('Generating ' + numOfProjsToGen + ' projects.');
      auditFactory.create('audit').then(audit =>{
        userFactory.createMany('user', usersData).then(usersArray => {
          projectFactory.createMany('project', numOfProjsToGen).then(projectsArray => {
            numOfProjsGenned = projectsArray.length;
            let genData = [usersArray, audit, projectsArray];
            resolve(genData);
          }).catch(error => {
            console.log("Project error:" + error);
            reject(error);
          }).finally(function(){
            console.log('Generated ' + numOfProjsGenned + ' projects.');
          });
        });
      });
    });
  })
  return projectGenerator;
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

  // Trigger the data generation, then use the variable we made as we generated the data
  // to double check the data in the (in-memory or real) database
  describe('Generate Projects', () => {
    test('Generator', done => {
      generateAll(usersData).then(generatedData =>{
        //console.log('generatedData: [' + generatedData + ']');
        let projects = generatedData[2];

        //throw projects
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
