'use strict';
const Promise = require("bluebird");
const faker = require('faker/locale/en');
const mongTypes = require('mongoose').Types;
Promise.longStackTraces();
const test_helper = require('./test_helper');
const app = test_helper.app;
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird'); // for extra debugging capabilities
//mongoose.Promise = global.Promise;  // without debugging extras
require('../../helpers/models/audit');
const factory = require('factory-girl').factory;
//the following include statements populate the 'factories' collection of factory-girl's singleton factory object
const auditFactory = require("./factories/audit_factory");
const userFactory = require("./factories/user_factory");
const organizationFactory = require("./factories/organization_factory");
const projectFactory = require("./factories/project_factory");
const commentPeriodFactory = require("./factories/comment_period_factory");
const commentFactory = require("./factories/comment_factory");
const documentFactory = require("./factories/document_factory");
const groupFactory = require("./factories/group_factory");
require('../../helpers/models/user');
require('../../helpers/models/project');
let ft = require('./factory_template');
let gd = require('./generated_data');

// Used to generate random values in the range [0 to CeilingValue] for correspondingly named objects
let generatorCeilings = {
    extraUsers: 50
  , documentsPerProject: 20
  , commentPeriodsPerProject: 2
  , documentsPerCommentPeriod: 3
  , commentsPerCommentPeriod: 300
  , groupsPerProject: 4
  , organizations: 120
};
let gc = generatorCeilings;

const uniqueStaticSeeds = {
    audit: 1
  , guaranteedUser: 234
  , extraUser: 106
  , project: 345
  , projectDocument: 105
  , commentPeriod: 101
  , commentPeriodDocument: 104
  , comment: 102
  , group: 924
  , organization: 436
};
const uss = uniqueStaticSeeds;

const commentPeriodTemplate = new ft.FactoryTemplate(commentPeriodFactory.name, generateCommentPeriodSetForProject, gc.commentPeriodsPerProject, uss.commentPeriod);
const commentTemplate = new ft.FactoryTemplate(commentFactory.name, generateCommentSetForCommentPeriod, gc.commentsPerCommentPeriod, uss.comment);
const projectDocumentTemplate = new ft.FactoryTemplate(documentFactory.name, generateDocumentSetForProject, gc.documentsPerProject, uss.projectDocument);
const commentPeriodDocumentTemplate = new ft.FactoryTemplate(documentFactory.name, generateDocumentSetForCommentPeriod, gc.documentsPerCommentPeriod, uss.commentPeriodDocument);
const groupTemplate = new ft.FactoryTemplate(groupFactory.name, generateGroupSetForProject, gc.groupsPerProject, uss.group);

// Data generation violates the single purpose principle on purpose.
// It generates data, saves model to db (mem or real), and outputs the data we generated
// so we can check that it got saved properly later and manipulate the data for tests.
// We do this because we are no longer using static seeded data.
function generateEntireDatabase(usersData) {
  // generate an Audit object needed by the app models, a mix of constant (test entry points) and random Users, and a number of Projects
  return generateProjects(usersData)
  .then(generatedData => { 
    // foreach Project, generate the Groups relating to it
    return new Promise(function(resolve, reject) {
      generateChildSets(generatedData.projects, generatedData.users, groupTemplate).then(groups => {
        generatedData.groups = groups;
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    // foreach Project, generate the Comment Periods relating to it
    return new Promise(function(resolve, reject) {
      generateChildSets(generatedData.projects, generatedData.users, commentPeriodTemplate).then(commentPeriods => {
        generatedData.commentPeriods = commentPeriods;
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    // foreach Comment Period, generate the Comments relating to it
    return new Promise(function(resolve, reject) {
      generateChildSets(generatedData.commentPeriods, generatedData.users, commentTemplate).then(comments => {
        generatedData.comments = comments;
        resolve(generatedData);
      });
    });
  })
  .then(generatedData => { 
    // foreach Comment Period, generate the Documents relating to it
    return new Promise(function(resolve, reject) {
      generateChildSets(generatedData.commentPeriods, generatedData.users, commentPeriodDocumentTemplate).then(commentPeriodDocuments => {
        generatedData.commentPeriodDocuments = commentPeriodDocuments;
        resolve(generatedData);
      });
    });
  }).then(generatedData => { 
    // foreach Project, generate the Documents relating to it
    return new Promise(function(resolve, reject) {
      generateChildSets(generatedData.projects, generatedData.users, projectDocumentTemplate).then(projectDocuments => {
        generatedData.projectDocuments = projectDocuments;
        resolve(generatedData);
      });
    });
  });
};

function generateGroupSetForProject(factoryKey, project, buildOptions, groupsToGen) {
  return new Promise(function(resolve, reject) {
    let customGroupSettings = { project: mongTypes.ObjectId(project._id) };
    factory.createMany(factoryKey, groupsToGen, customGroupSettings, buildOptions).then(groups => {
      let groupIds = [];
      for (i = 0; i < groups.length; i++) {
        if (-1 == groupIds.indexOf(mongTypes.ObjectId(groups[i].id))) groupIds.push(mongTypes.ObjectId(groups[i].id)); 
      }
      project.groups = groupIds;
      resolve(groups);
    });
  });
};

function generateCommentPeriodSetForProject(factoryKey, project, buildOptions, commentPeriodsToGen) {
  return new Promise(function(resolve, reject) {
    let customCommentPeriodSettings = { project: mongTypes.ObjectId(project._id) };
    factory.createMany(factoryKey, commentPeriodsToGen, customCommentPeriodSettings, buildOptions).then(commentPeriods => {
      resolve(commentPeriods);
    });
  });
};

function generateCommentSetForCommentPeriod(factoryKey, commentPeriod, buildOptions, commentsToGen) {
  return new Promise(function(resolve, reject) {
    let customCommentSettings = { commentPeriod: mongTypes.ObjectId(commentPeriod._id) };
    factory.createMany(factoryKey, commentsToGen, customCommentSettings, buildOptions).then(comments => {
      resolve(comments);
    });
  });
};

function generateDocumentSetForProject(factoryKey, project, buildOptions, projectDocumentsToGen) {
  return new Promise(function(resolve, reject) {
    let customDocumentSettings = { documentSource: "PROJECT", project: mongTypes.ObjectId(project._id) };
    factory.createMany(factoryKey, projectDocumentsToGen, customDocumentSettings, buildOptions).then(documents => {
      resolve(documents);
    });
  });
};

function generateDocumentSetForCommentPeriod(factoryKey, commentPeriod, buildOptions, commentPeriodDocumentsToGen) {
  return new Promise(function(resolve, reject) {
  let customDocumentSettings = { documentSource: "COMMENT", project: mongTypes.ObjectId(commentPeriod.project), _comment: mongTypes.ObjectId(commentPeriod._id) };  // note that the document._comment field actually refers to a commentPeriod id
    factory.createMany(factoryKey, commentPeriodDocumentsToGen, customDocumentSettings, buildOptions).then(documents => {
      resolve(documents);
    });
  });
};

function generateProjects(usersData) {
  let projectGenerator = new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      let numOfProjsToGen = genSettings.projects;
      let numOfProjsGenned = 0;
      if (isNaN(numOfProjsToGen)) numOfProjsToGen = test_helper.defaultNumberOfProjects;
      console.log('Generating ' + numOfProjsToGen + ' projects.');
      
      factory.create(auditFactory.name, {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.audit)}).then(audit =>{
        factory.createMany(userFactory.name, usersData, {faker: getSeeded(genSettings.generate_consistent_data, uss.guaranteedUser)}).then(guaranteedUsersArray => {
          factory.createMany(userFactory.name, generatorCeilings.extraUsers, {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.extraUser)}).then(extraUsersArray => {
            let users = guaranteedUsersArray.concat(extraUsersArray);       
            factory.createMany(organizationFactory.name, generatorCeilings.organizations, {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.organization)}).then(orgsArray => {
              factory.createMany(projectFactory.name, numOfProjsToGen, {}, {faker: getSeeded(genSettings.generate_consistent_data, uss.project), usersPool: users, orgsPool: orgsArray}).then(projectsArray => {
                numOfProjsGenned = projectsArray.length;
                let genData = new gd.GeneratedData();
                genData.audit = audit;
                genData.users = users;
                genData.organizations = orgsArray;
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
      });
    });
  })
  return projectGenerator;
};

function generateChildSets(parents, usersPool, factoryTemplate) {
  if (0 == parents.length) return new Promise(function(resolve, reject) { resolve([]); });
  return new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      let buildOptions = {faker: getSeeded(genSettings.generate_consistent_data, factoryTemplate.seed), usersPool: usersPool}
      let childGenerationPromises = parents.map(parent => {
        return generateChildSet(parent, buildOptions, factoryTemplate);
      });
      resolve(Promise.all(childGenerationPromises));
    });
  }).catch(error => {
    console.log(factoryTemplate.factoryKey + "s error:" + error);
    reject(error);
  }).finally(function(){
    console.log("Generated all " + factoryTemplate.factoryKey + " sets.");
  });
}

function generateChildSet(parent, buildOptions, factoryTemplate) {
  return new Promise(function(resolve, reject) {
    test_helper.dataGenerationSettings.then(genSettings => {
      (genSettings.generate_consistent_data) ? faker.seed(factoryTemplate.seed) : faker.seed();
      let childrenToGen = faker.random.number(factoryTemplate.upperBound).valueOf();
      if (0 < childrenToGen) {
        resolve(factoryTemplate.factoryMethod(factoryTemplate.factoryKey, parent, buildOptions, childrenToGen));
      } else {
        resolve([]);
      }
    });
  }).catch(error => {
    console.log(factoryTemplate.factoryKey + " set generation error:" + error);
    reject(error);
  }).finally(function(){
    console.log("Generated " + factoryTemplate.factoryKey + " set.");
  });
};

function getSeeded(setConstant, seed) {
  return (setConstant) ? (require('faker/locale/en')).seed(seed) : (require('faker/locale/en')).seed();
}

exports.uss = uniqueStaticSeeds; // external shorthand alias for brevity
exports.generateEntireDatabase = generateEntireDatabase;
;