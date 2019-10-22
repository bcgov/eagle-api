'use strict';
const Promise = require("bluebird");
const faker = require('faker/locale/en');
Promise.longStackTraces();
const test_helper = require('./test_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird'); // for extra debugging capabilities
//mongoose.Promise = global.Promise;  // without debugging extras
require('../helpers/models/audit');
const auditFactory = require("./factories/audit_factory").factory;
const userFactory = require("./factories/user_factory").factory;
const projectFactory = require("./factories/project_factory").factory;
const commentPeriodFactory = require("./factories/comment_period_factory").factory;
const commentFactory = require("./factories/comment_factory").factory;
const documentFactory = require("./factories/document_factory").factory;
require('../helpers/models/user');
require('../helpers/models/project');
let gd = require('./generated_data');

// Generate [0] to [CeilingValue] of the following objects
let generatorCeilings = {
  documentsPerProject: 20
, commentPeriodsPerProject: 2
, documentsPerCommentPeriod: 3
, commentsPerCommentPeriod: 300
};
let gc = generatorCeilings; // shorthand alias for brevity

const uniqueStaticSeeds = {
    audit: 1
  , user: 234
  , project: 345
  , projectDocument: 105
  , commentPeriod: 101
  , commentPeriodDocument: 104
  , comment: 102
};
const uss = uniqueStaticSeeds; // shorthand alias for brevity

// Data generation violates the single purpose principle on purpose.
// It generates data, saves model to db (mem or real), and outputs the data we generated
// so we can check that it got saved properly later and manipulate the data for tests.
// We do this because we are no longer using static seeded data.
function generateAll(usersData) {
  return generateProjects(usersData)
  .then(generatedData => { 
    return new Promise(function(resolve, reject) {
      generateCommentPeriods(generatedData.projects).then(commentPeriods => {
        generatedData.commentPeriods = commentPeriods;
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    return new Promise(function(resolve, reject) {
      generateComments(generatedData.commentPeriods).then(comments => {
        generatedData.comments = comments;
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    return new Promise(function(resolve, reject) {
      generateDocumentsForCommentPeriods(generatedData.commentPeriods).then(commentPeriodDocuments => {
        generatedData.commentPeriodDocuments = commentPeriodDocuments;
        resolve(generatedData);
      });
    });
  }).then(generatedData => { 
    return new Promise(function(resolve, reject) {
      generateDocumentsForProjects(generatedData.projects).then(projectDocuments => {
        generatedData.projectDocuments = projectDocuments;
        resolve(generatedData);
      });
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
      test_helper.dataGenerationSettings.then(genSettings => {
        (genSettings.generate_consistent_data) ? faker.seed(uss.commentPeriod) : faker.seed();
        let commentPeriodsToGen = faker.random.number(gc.commentPeriodsPerProject).valueOf();
        if (0 < commentPeriodsToGen) {
          commentPeriodFactory.createMany('commentPeriod', commentPeriodsToGen, { project: project._id }).then(commentPeriodsArray => {
            resolve(commentPeriodsArray);
          });
        } else {
          resolve([]);
        }
      });
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
    test_helper.dataGenerationSettings.then(genSettings => {
      (genSettings.generate_consistent_data) ? faker.seed(uss.comment) : faker.seed();
      let commentsToGen = faker.random.number(gc.commentsPerCommentPeriod).valueOf();
      if (0 < commentsToGen) {
        commentFactory.createMany('comment', commentsToGen, { commentPeriod: commentPeriod._id }).then(commentsArray => {
          resolve(commentsArray);
        });
      } else {
        resolve([]);
      }
    });
  }).catch(error => {
    console.log("Comment error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comment.');
  });
};

function generateDocumentsForProjects(projects) {
  return new Promise(function(resolve, reject) {
    let projectDocumentPromises = projects.map((project) => {
      return generateDocumentForProject(project);
    });
    resolve(Promise.all(projectDocumentPromises));
  }).catch(error => {
    console.log("Projects documents error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated projects documents.');
  });
};

function generateDocumentForProject(project) {
  return new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      (genSettings.generate_consistent_data) ? faker.seed(uss.projectDocument) : faker.seed();
      let projectDocumentsToGen = faker.random.number(gc.documentsPerProject).valueOf();
      let customDocumentSettings = { documentSource: "PROJECT", project: project._id };
      if (0 < projectDocumentsToGen) {
        documentFactory.createMany('document', projectDocumentsToGen, customDocumentSettings).then(documentsArray => {
          resolve(documentsArray);
        });
      } else {
        resolve([]);
      }
    });
  }).catch(error => {
    console.log("Project document error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated project document.');
  });
};

function generateDocumentsForCommentPeriods(commentPeriods) {
  return new Promise(function(resolve, reject) {
    let commentPeriodDocumentPromises = commentPeriods.map((commentPeriod) => {
      return generateDocumentForCommentPeriod(commentPeriod);
    });
    resolve(Promise.all(commentPeriodDocumentPromises));
  }).catch(error => {
    console.log("Comment periods documents error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comment periods documents.');
  });
};

function generateDocumentForCommentPeriod(commentPeriod) {
  return new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      (genSettings.generate_consistent_data) ? faker.seed(uss.commentPeriodDocument) : faker.seed();
      let commentPeriodDocumentsToGen = faker.random.number(gc.documentsPerCommentPeriod).valueOf();
      let customDocumentSettings = { documentSource: "COMMENT", project: commentPeriod.project, _comment: commentPeriod._id };
      if (0 < commentPeriodDocumentsToGen) {
        documentFactory.createMany('document', commentPeriodDocumentsToGen, customDocumentSettings).then(documentsArray => {
          resolve(documentsArray);
        });
      } else {
        resolve([]);
      }
    });
  }).catch(error => {
    console.log("Comment period document error:" + error);
    reject(error);
  }).finally(function(){
    console.log('Generated comment period document.');
  });
};

function generateProjects(usersData) {
  let projectGenerator = new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      let numOfProjsToGen = genSettings.projects;
      let numOfProjsGenned = 0;
      if (isNaN(numOfProjsToGen)) numOfProjsToGen = test_helper.defaultNumberOfProjects;
      console.log('Generating ' + numOfProjsToGen + ' projects.');
      auditFactory.create('audit', {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.audit)}).then(audit =>{
        userFactory.createMany('user', usersData, {faker: getSeeded(genSettings.generate_consistent_data, uss.user)}).then(usersArray => {
          projectFactory.createMany('project', numOfProjsToGen, {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.project)}).then(projectsArray => {
            numOfProjsGenned = projectsArray.length;
            let genData = new gd.GeneratedData();
            genData.audit = audit;
            genData.users = usersArray;
            genData.projects = projectsArray;
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

function getSeeded(setConstant, seed) {
  return (setConstant) ? (require('faker/locale/en')).seed(seed) : (require('faker/locale/en')).seed();
}

exports.uss = uniqueStaticSeeds; // external shorthand alias for brevity
exports.generateAll = generateAll;
exports.generateCommentPeriods = generateCommentPeriods;
exports.generateCommentPeriod = generateCommentPeriod;
exports.generateComments = generateComments;
exports.generateComment = generateComment;
exports.generateProjects = generateProjects;