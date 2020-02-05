const request = require('supertest');
const test_helper = require('../../test_helper');
const generate_helper = require('../../generate-data/generate_helper');
const projectController = require('../../../controllers/projectV2');
const projectDAO = require('../../../dao/projectDAO');
const factory_helper = require('../../generate-data/factories/factory_helper');

require('../../../helpers/models/group');
require('../../../helpers/models/project');

const app = test_helper.app;

const PUBLIC_ROLES = ['public'];
const SECURE_ROLES = ['sysadmin', 'staff'];

describe('API Testing - Project DAO', () => 
{  
    let adminUser = factory_helper.generateFakePerson('Stanley', '', 'Adminington');
    let publicUser = factory_helper.generateFakePerson('Joe', '', 'Schmo');
    const usersData = [
        {firstName: adminUser.firstName, middleName: adminUser.middleName, lastName: adminUser.lastName, displayName: adminUser.fullName, email: adminUser.emailAddress, read: adminUser.read, write: adminUser.write, delete: adminUser.delete}
       ,{firstName: publicUser.firstName, middleName: publicUser.middleName, lastName: publicUser.lastName, displayName: publicUser.fullName, email: publicUser.emailAddress, read: publicUser.read, write: publicUser.write, delete: publicUser.delete}
    ];

    // Default params
    const params = 
    {
        pageNumber: 1,
        pageSize: 10,
        sortBy: '',
        query: '',
        keywords: ''
    }

    // get projects
    test('GET projects (public and secure methods)', async done => 
    {
        test_helper.dataGenerationSettings.then(async genSettings => 
        {
            // Default is to not run the data generator when running global tests
            if (genSettings.generate) 
            {
                generate_helper.generateEntireDatabase(usersData).then(async generatedData =>
                {
                    let projects = generatedData.projects;
      
                    projects.map((project) => 
                    {
                        expect(project._id).toEqual(jasmine.any(Object));
                        switch (project.currentLegislationYear) 
                        {
                            case "1996":
                                expect(project.legislation_1996.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                                break;
                            case "2002":
                                expect(project.legislation_2002.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                                break;
                            case "2018":
                                expect(project.legislation_2018.CELeadEmail).toEqual("eao.compliance@gov.bc.ca");
                                break;
                            default:
                                expect(project.CELeadEmail).toEqual("legislation not set properly");
                        }
                    });

                    //roles, pageNumber, pageSize, sortBy, keywords, query
                    let pubResult = await projectDAO.getProjects(PUBLIC_ROLES, params.pageNumber, params.pageSize, params.sortBy, params.keywords, params.query);
                    let secureResult = await projectDAO.getProjects(SECURE_ROLES, params.pageNumber, params.pageSize, params.sortBy, params.keywords, params.query);

                    console.log(pubResult);

                    // Pass: exists, 10 items, lists are the same
                    expect(pubResult).not.toEqual(null);
                    expect(secureResult).not.toEqual(null);
                    expect(pubResult[0].searchResults).not.toEqual(null);
                    expect(secureResult[0].searchResults).not.toEqual(null);
                    expect(pubResult[0].searchResults.length).toEqual(10);
                    expect(secureResult[0].searchResults.length).toEqual(10);
                    expect(pubResult[0].searchResults[0]._id).toEqual(secureResult[0].searchResults[0]._id);

                });
            }
        });
    });

    // create Project
    // get project
    // update project
    // delete project
});