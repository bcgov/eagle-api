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
const auditFactory = require("./factories/audit_factory").factory;
const userFactory = require("./factories/user_factory").factory;
const projectFactory = require("./factories/project_factory").factory;
const commentPeriodFactory = require("./factories/comment_period_factory").factory;
const commentFactory = require("./factories/comment_factory").factory;
require('../helpers/models/user');
require('../helpers/models/project');
const readline = require('readline');
const fs = require('fs');

const defaultNumberOfProjects = 1;

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

function generateCommentPeriods(projects) {
  return new Promise(function(resolve, reject) {
    let commentPeriodPromises = projects.map(project => {
      return generateCommentPeriod(project);
    });
    resolve(Promise.all(commentPeriodPromises));
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
    let commentPromises = commentPeriods.map((commentPeriod) => {
      return generateComment(commentPeriod);
    });
    resolve(Promise.all(commentPromises));
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

exports.generateAll = generateAll;
exports.getGenNumFromFile = getGenNumFromFile;
exports.generateCommentPeriods = generateCommentPeriods;
exports.generateCommentPeriod = generateCommentPeriod;
exports.generateComments = generateComments;
exports.generateComment = generateComment;
exports.generateProjects = generateProjects;