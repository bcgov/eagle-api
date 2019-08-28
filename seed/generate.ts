'use strict';

import { factory as projectFactory } from '../api/test/factories/project_factory';

if (2 == process.argv.length) process.exit();

let projectsToGenerate = Number(process.argv[2]);

if (isNaN(projectsToGenerate)) process.exit();

console.log('Generating ' + projectsToGenerate + ' projects...');


function setupProjects(projectsData: any) {
    return new Promise(function(resolve, reject) {
        projectFactory.createMany('application', projectsData).then((projectArray: unknown) => {
        resolve(projectArray);
      }).catch((error: any) => {
        reject(error);
      });
    });
  };
