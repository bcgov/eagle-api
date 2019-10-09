'use strict';
const Promise = require("bluebird");
Promise.longStackTraces();
const test_helper = require('./test_helper');
const factory_helper = require('./factories/factory_helper');
const app = test_helper.app;
const hashElement = require('folder-hash');
const _ = require('lodash');

const generate_helper = require("./generate_helper");

// const options = {
//     folders: { 
//         include: ['.*', '*_helper.js', 'test_coverage']
//         , exclude: ['.*', '*_helper.js', 'test_coverage'] },
//     files: { 
//         include: ['*.js']
//         , exclude: ['*_helper.js'] }
// };

// describe('Catch Model Changes not done in Factories', () => {
//   const factoriesCoveredByDataGeneration = {};
//   const modelsCoveredByDataGeneration = {};

//   describe('Check Models & Factories', () => {
//     test('Generator', done => {
//       generate_helper.generateAll(usersData).then(generatedData =>{
//         console.log(((generate_helper.genSettings.generate_consistent_data) ? "Consistent" : "Random") + " data generation " + ((generate_helper.genSettings.save_to_persistent_mongo) ? "saved" : "unsaved"));
//         //console.log('generatedData: [' + generatedData + ']');
//         let projects = generatedData[2];
//         console.log('projects: [' + projects + ']');

//         // throw projects
//         projects.map((project) => {
//           console.log('Project [id, name]: [' + project._id + ', ' + project.name + ']');
//           //console.log('        [shortName, dateAdded, dateUpdated]: [' + project.shortName + ', ' + project.dateAdded + ',' + project.dateUpdated + ']');
//           //console.log('        [projectLead, projectLeadEmail]: [' + project.projectLead + ', ' + project.projectLeadEmail + ']');
//           expect(project._id).toEqual(jasmine.any(Object));
//           expect(project.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
//           //TODO:: Check the outputted data against the database model
//           done();
//         });
//       });
//     });
//   });

});
