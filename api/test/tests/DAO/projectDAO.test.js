const request = require('supertest');
const test_helper = require('../../test_helper');
const gh = require('../../generate-data/generate_helper');
const projectController = require('../../../controllers/projectV2');
const projectDAO = require('../../../dao/projectDAO');
const projectGroupDAO = require('../../../dao/projectGroupDAO');
const pinDAO = require('../../../dao/pinDAO');
const factory_helper = require('../../generate-data/factories/factory_helper');

const group = require('../../../helpers/models/group');
const project = require('../../../helpers/models/project');

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

    const emptyParams = test_helper.buildParams({});
    const testUser = 'testUser';

    let createdProject = null;
    let testProject = new project();

    testProject.CEAAInvolvement     = null; //oid
    testProject.CELead              = '';
    testProject.CELeadEmail         = '';
    testProject.CELeadPhone         = '';
    testProject.centroid            = [ 123, 49 ];
    testProject.description         = 'Test Project, please delete me';
    testProject.eacDecision         = null; // oid
    testProject.location            = 'Right behind you';
    testProject.name                = 'An excellent test project';
    testProject.projectLeadId       = null; // oid
    testProject.projectLead         = '';
    testProject.projectLeadEmail    = '';
    testProject.projectLeadPhone    = '';
    testProject.proponent           = null; // oid
    testProject.region              = 'Lower Mainland';
    testProject.responsibleEPDId    = null; // oid
    testProject.responsibleEPD      = '';
    testProject.responsibleEPDEmail = '';
    testProject.responsibleEPDPhone = '';
    testProject.type                = 'Energy-Petroleum & Natural Gas';
    testProject.legislation         = '2018 Environmental Assessment Act';
    testProject.legislationYear     = 2018;
    testProject.nameSearchTerms     = ['Test'];
    testProject.addedBy             = '';
    testProject.build               = 'modification';
    testProject.CEAALink            = '';
    testProject.code                = '';
    testProject.commodity           = '';
    testProject.currentPhaseName    = null; // oid
    testProject.phaseHistory        = '';
    testProject.dateAdded           = '';
    testProject.dateCommentsClosed  = '';
    testProject.dateCommentsOpen    = '';
    testProject.dateUpdated         = '';
    testProject.decisionDate        = null;
    testProject.duration            = '';
    // TODO: directoryStructure
    testProject.eaoMember           = '';
    testProject.fedElecDist         = '';
    // TODO: intake
    testProject.intake              = '';
    testProject.isTermsAgreed       = false;
    testProject.overallProgress     = 0;
    testProject.primaryContact      = '';
    testProject.proMember           = '';
    testProject.provElecDist        = '';
    testProject.sector              = 'Energy Storage Facilities';
    testProject.shortName           = '';
    testProject.status              = 'Early Engagement';
    testProject.substitution        = false;
    // TODO: New Stuff?
    testProject.eaStatusDate        = '';
    testProject.eaStatus            = '';
    testProject.projectStatusDate   = '';
    testProject.substantiallyDate   = '';
    testProject.substantially       = false;
    testProject.disputeDate         = '';
    testProject.dispute             = false;
    testProject.activeDate          = '';
    testProject.activeStatus        = '';
    // Project Review Data
    testProject.review180Start      = null;
    testProject.review45Start       = null;
    testProject.reviewSuspensions   = {};
    testProject.reviewExtensions    = {};
    testProject.projLead            = null; // oid
    testProject.execProjectDirector = null; // oid
    testProject.complianceLead      = null; // oid
    testProject.groups              = null;

    // test options requests
    test('OPTION `/api/V2/project` returns 200', done => 
    {
        app.options('/api/V2/project', (req, res) => 
        {
            return projectController.projectOptionsProtected(emptyParams, res);
        });

        request(app)
        .options('/api/V2/project')
        .expect(200, done);
    });

    test('OPTION `/api/V2/public/project` returns 200', done => 
    {
        app.options('/api/V2/public/project', (req, res) => 
        {
            return projectController.projectOptions(emptyParams, res);
        });

        request(app)
        .options('/api/V2/public/project')
        .expect(200, done);
    });

    // test create a project
    test('POST `/api/V2/project` returns 201', done => 
    {
        app.post('/api/V2/project', (req, res) => 
        {
            let testParams = 
            {
                swagger: 
                {
                    params:
                    {
                        project: { value: testProject },
                        auth_payload: { preferred_username: 'Test User' }
                    }
                }
            };

            return projectController.createProject(testParams, res);
        });

        request(app)
        .post('/api/V2/project')
        .expect(201)
        .end((err, res) => 
        {
            if (err) 
            {
              return done(err);
            }

            createdProject = res.body;

            expect(res.body.id).not.toEqual(null);
            expect(res.body._schemaName).toEqual('Project');

            return done();
        });
    });

    /*
    // test fetching projects
    test('GET `/api/V2/public/project` returns 200', done => 
    {
        app.get('/api/V2//public/project', (req, res) => 
        {
            let testParams = 
            {
                swagger: 
                {
                    params:
                    {
                        auth_payload: { preferred_username: 'Test User' }
                    }
                }
            };

            return projectController.fetchProjects(testParams, res);
        });

        request(app)
        .get('/api/V2/project')
        .expect(200)
        .end((err, res) => 
        {
            if (err) 
            {
              return done(err);
            }

            console.log(res);
            console.log(res.body);

            return done();
        });
    });
*/

    /*
    // get projects
    test('Projects DAO (public and secure methods)', done => 
    {
        console.log('Starting tests');

        // Create test projects
        let testProject = {};

        let createdProject = await projectDAO.createProject(adminUser.displayName, testProject);
        expect(createdProject).not.toEqual(null);
        // test that both root and created project details match

        // Update test projects
        let updatedProject = createdProject;
        let finalUpdatedProject = await projectDAO.updateProject(adminUser.displayName, createdProject, updatedProject );

        expect(finalUpdatedProject).not.toEqual(null);
        // test that root updated and finalUpdated projects match

        // Fetch test project publically and securely
        let pubResult = await projectDAO.getProjects(PUBLIC_ROLES, params.pageNumber, params.pageSize, params.sortBy, params.keywords, params.query);
        let secureResult = await projectDAO.getProjects(SECURE_ROLES, params.pageNumber, params.pageSize, params.sortBy, params.keywords, params.query);

        expect(pubResult).not.toEqual(null);
        expect(secureResult).not.toEqual(null);
        expect(pubResult[0].searchResults).not.toEqual(null);
        expect(secureResult[0].searchResults).not.toEqual(null);
        expect(pubResult[0].searchResults.length).toEqual(1);
        expect(secureResult[0].searchResults.length).toEqual(1);
        expect(pubResult[0].searchResults[0]._id).toEqual(secureResult[0].searchResults[0]._id);

        // create group
        let newGroup = {};
        let createdGroup = await projectGroupDAO.createGroup(adminUser.displayName, newGroup, finalUpdatedProject);
        
        expect(createdGroup).not.toEqual(null);

        // fetch groups
        let fetchedGroup = await projectGroupDAO.getGroup(createdGroup._id);
        expect(fetchedGroup).not.toEqual(null);

        // delete group
        let deletedGroup = await projectGroupDAO.deleteGroup(adminUser.displayName, fetchedGroup, finalUpdatedProject);
        expect(deletedGroup).not.toEqual(null);

        // create pin
        let newPin = {};
        let createdPin = await pinDAO.createPin(adminUser.displayName, finalUpdatedProject, newPin);
        expect(createdPin).not.toEqual(null);

        // delete pin
        let deletedPin = await pinDAO.deletePin(adminUser.displayName, createdPin._id, finalUpdatedProject);
        expect(deletedPin).not.toEqual(null);

        // delete test project(s)
        let deletedProject = await projectDAO.deleteProject(adminUser.displayName, finalUpdatedProject);
        expect(deletedProject).not.toEqual(null);
    }); */
});