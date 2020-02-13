const request = require('supertest');
const test_helper = require('../../test_helper');
const gh = require('../../generate-data/generate_helper');
const projectController = require('../../../controllers/projectV2');
const projectDAO = require('../../../dao/projectDAO');
const projectGroupDAO = require('../../../dao/projectGroupDAO');
const pinDAO = require('../../../dao/pinDAO');
const factory_helper = require('../../generate-data/factories/factory_helper');
const constants = require('../../../helpers/constants');

const group = require('../../../helpers/models/group');
const project = require('../../../helpers/models/project');

const app = test_helper.app;

describe('API Testing - Project DAO', () => 
{  
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

    test('Project CRUD tests', async () => 
    {
        // Create
        let createdProject = await projectDAO.createProject('Test User', testProject);
        
        expect(createdProject.id).not.toEqual(null);

        let loadedProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);

        expect(loadedProject).not.toEqual(null);
        expect(loadedProject._id).toEqual(createdProject._id);

        loadedProject.shortName = 'Changed Short Name!';

        let updatedProject = await projectDAO.updateProject('Test User', createdProject, loadedProject);

        expect(updatedProject).not.toEqual(null);
        expect(updatedProject._id).toEqual(createdProject._id);

        let deletedProject = await projectDAO.deleteProject('Test User', createdProject, updatedProject);

        expect(deletedProject).not.toEqual(null);
        expect(deletedProject._id).toEqual(createdProject._id);
    });

    test('Project Pin tests', async () => 
    {
        let createdProject = await projectDAO.createProject('Test User', testProject);
        expect(createdProject.id).not.toEqual(null);

        let pins = { value: [123, 456, 789]};
        let result = await pinDAO.createPin('Test User', createdProject, pins);
        expect(result).not.toEqual(null);
        expect(result.nModified).toBeGreaterThan(0);

        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);

        result = await pinDAO.publishPins('Test', createdProject);
        expect(result.nModified).toBeGreaterThan(0);
        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);

        result = await pinDAO.unPublishPins('Test', createdProject);
        expect(result.nModified).toBeGreaterThan(0);
        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);

        result = await pinDAO.deletePin('Test', createdProject.pins[2], createdProject);
        expect(result.nModified).toBeGreaterThan(0);
        result = await pinDAO.deletePin('Test', createdProject.pins[1], createdProject);
        expect(result.nModified).toBeGreaterThan(0);
        result = await pinDAO.deletePin('Test', createdProject.pins[0], createdProject);
        expect(result.nModified).toBeGreaterThan(0);

        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);
        expect(createdProject.pins.length).toEqual(0);
    });

    // ? Include group add members once the Users endpoints for v2 have been created
    test('Project Group tests', async () => 
    {
        // Create
        let createdProject = await projectDAO.createProject('Test User', testProject);
        expect(createdProject.id).not.toEqual(null);

        let result = await projectGroupDAO.createGroup('Test', 'Test', createdProject);
        expect(result).not.toEqual(null);
        expect(result.project).toEqual(createdProject._id);
        expect(result.name).toEqual('Test');

        let editedGroup = 
        {
            name: 'Edited Test',
            members: result.members,
            project: result.project,
            read: result.read,
            write: result.write,
            delete: result.delete,
            _schemaName: 'Group',
            _id: result._id,
            __v: result.__v,
            id: result.id
        }

        result = await projectGroupDAO.updateGroup('Test', editedGroup, result);
        expect(result).not.toEqual(null);
        expect(result.project).toEqual(createdProject._id);
        expect(result.name).toEqual('Edited Test');

        let fetchedResult = await projectGroupDAO.getGroup(result._id);
        expect(fetchedResult).not.toEqual(null);
        expect(fetchedResult).toMatchObject(result);

        result = await projectGroupDAO.deleteGroup('Test', fetchedResult, createdProject);
        result = await projectGroupDAO.getGroup(fetchedResult._id);
        expect(result).toEqual(null);
    });

    // ? Extensions appear to be removed from the Admin UI
    // ?  These tests will be disabled until these are readded
    /*test('Project Extension tests', async () => 
    {
        let createdProject = await projectDAO.createProject('Test User', testProject);
        expect(createdProject.id).not.toEqual(null);

        let extension = 
        {
            type: 'Extension',
            appliedTo: {},
            start: new Date(),
            end: new Date()
        };

        let result = await projectDAO.addExtension('Test', extension, createdProject);
        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);
        expect(result.nModified).toBeGreaterThan(0);
        expect(createdProject.reviewExtensions).not.toEqual(null);
        expect(createdProject.reviewExtensions.length).toBeGreaterThan(0);

        createdProject.reviewExtensions[0].description = 'This is an update';
        result = await projectDAO.updateExtension('Test', extension, createdProject);
        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);
        expect(result.nModified).toBeGreaterThan(0);
        expect(createdProject.reviewExtensions).not.toEqual(null);
        expect(createdProject.reviewExtensions.length).toBeGreaterThan(0);

        result = await projectDAO.deleteExtension('Test', extension, createdProject);
        createdProject = await projectDAO.getProject(constants.SECURE_ROLES, createdProject._id);
    });*/
});