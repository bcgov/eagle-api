const request            = require('supertest');
const test_helper        = require('../../test_helper');
const gh                 = require('../../generate-data/generate_helper');
const documentController = require('../../../controllers/documentsV2');
const projectDAO         = require('../../../dao/projectDAO');
const documentDAO        = require('../../../dao/documentDAO');
const factory_helper     = require('../../generate-data/factories/factory_helper');
const constants          = require('../../../helpers/constants');
const document           = require('../../../helpers/models/document');
const project            = require('../../../helpers/models/project');
const fs                 = require('fs');

const app = test_helper.app;

describe('API Testing - Documents DAO', () => 
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

    test('Document CRUD tests', async () => 
    {
        // create a dummy project
        let project = await projectDAO.createProject('Test User', testProject);
        // let comment = Waiting for Comment v2 controller and handlers
        
        // get a couple of dummy file handles for upload
        //const publicFile = new File(['(⌐□_□)'], 'testPublicFile.png', { type: 'image/png' })
        const secureFile = fs.readFileSync('../test_docs/Oahu.png');
        //let publicDocumentDetails = 
        //{
        //    originalName       : 'testPublicFile',
        //    displayName        : fileName,
        //    documentSource     : 'COMMENT',
        //    documentAuthor     : 'Johnny Awesome',
        //    documentAuthorType : null,
        //};

        let secureDocumentDetails = 
        {
            originalName       : 'testSecureFile',
            fileName           : originalName,
            displayName        : fileName,
            legislation        : null,
            documentSource     : 'PROJECT',
            eaoStatus          : 'Published',
            publish            : false,
            milestone          : null,
            type               : null,
            documentAuthor     : 'Johnny Awesome',
            documentAuthorType : null,
            dateUploaded       : new Date(),
            datePosted         : new Date(),
            description        : 'Testing, testing, 1, 2, 3',
            projectPhase       : null
        };

        // create Public ? Waiting for comment v2 enpoints
        // let pubDocument = await documentDAO.createDocument('Test User', null, comment, ?, publicDocumentDetails, true);

        console.log(secureFile);
        console.log(JSON.stringify(secureFile));

        expect(0).toEqual(1);

        // create Secure
        let secureDocument = await documentDAO.createDocument('Test User', project._id, null, secureFile, secureDocumentDetails, false);
        // update
        let updatedDocument = await documentDAO.updateDocument('Test User', secureDocument, secureDocument.project, secureFile, {});
        // publish
        updatedDocument = await documentDAO.publishDocument('Test User', updatedDocument);
        // unpublish
        updatedDocument = await documentDAO.unPublishDocument('Test User', updatedDocument);
        // feature
        updatedDocument = await documentDAO.featureDocument(updatedDocument, project);
        // unfeature
        updatedDocument = await documentDAO.unfeatureDocument(updatedDocument, project);
        // download
        let meta = await documentDAO.downloadDocumentGetMeta(constants.SECURE_ROLES, 'Test User', updatedDocument, 'good_name');
        // delete
        updatedDocument = await documentDAO.deleteDocument('Test User', updatedDocument);
        //pubDocument = await documentDAO.deleteDocument('Test User', pubDocument);
        // delete the temp documents from Minio as well!
        // public
        //MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, updatedDocument.project, updatedDocument.internalURL);
        // secure
        MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, pubDocument.project, pubDocument.internalURL);               
    });
});