const projectDAO         = require('../../../dao/projectDAO');
const documentDAO        = require('../../../dao/documentDAO');
const constants          = require('../../../helpers/constants');
const project            = require('../../../helpers/models/project');
const fs                 = require('fs');
const MinioController    = require('../../../helpers/minio');

require('../../test_helper');
require('../../../helpers/models/audit');
require('../../../helpers/models/document');

describe('API Testing - Documents DAO', () => {
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

  test('Document CRUD tests', async () => {
    // create a dummy project
    let project = await projectDAO.createProject('Test User', testProject);
    // let comment = Waiting for Comment v2 controller and handlers

    // get a couple of dummy file handles for upload
    //const publicFile = new File(['(⌐□_□)'], 'testPublicFile.png', { type: 'image/png' })
    const secureFileBuffer = fs.readFileSync('./api/test/tests/test_docs/Oahu.png');
    let secureFile =
        {
          buffer: secureFileBuffer,
          encoding: '7bit',
          fieldname: 'upfile',
          mimetype: 'image/png',
          originalname: 'Oahu.png',
          size: 12345
        };

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
          fileName           : 'testSecureFile',
          displayName        : 'testSecureFile',
          legislation        : '2018',
          documentSource     : 'PROJECT',
          eaoStatus          : 'Rejected',
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
    // create Secure
    let secureDocument = await documentDAO.createDocument('Test User', project._id, null, secureFile, 'png', secureDocumentDetails, false);

    expect(secureDocument).not.toEqual(null);
    expect(secureDocument.documentFileName).toEqual('testSecureFile');

    // Update
    secureDocument.documentFileName = 'Updated test file name';
    secureDocument.internalExt = 'png';
    let updatedDocument = await documentDAO.updateDocument('Test User', secureDocument, secureDocument.project, secureFile, secureDocument);

    expect(updatedDocument).not.toEqual(null);
    expect(updatedDocument.documentFileName).toEqual('Updated test file name');

    // publish
    updatedDocument = await documentDAO.publishDocument('Test User', updatedDocument);

    expect(updatedDocument).not.toEqual(null);
    expect(updatedDocument.eaoStatus).toEqual('Published');

    // fetch
    let docResults = await documentDAO.fetchDocuments(0, 1000, null, null, null, project._id, [], constants.PUBLIC_ROLES);
    expect(docResults).not.toEqual(null);
    expect(docResults[0].searchResults.length).toEqual(1);
    expect(docResults[0].searchResults[0]._id).toEqual(updatedDocument._id);

    // unpublish
    updatedDocument = await documentDAO.unPublishDocument('Test User', updatedDocument);

    expect(updatedDocument).not.toEqual(null);
    expect(updatedDocument.eaoStatus).toEqual('Rejected');

    docResults = await documentDAO.fetchDocuments(0, 1000, null, null, null, project._id, [], constants.PUBLIC_ROLES);
    expect(docResults).not.toEqual(null);
    expect(docResults[0].searchResults.length).toEqual(0);

    docResults = await documentDAO.fetchDocuments(0, 1000, null, null, null, project._id, [], constants.SECURE_ROLES);
    expect(docResults).not.toEqual(null);
    expect(docResults[0].searchResults.length).toEqual(1);
    expect(docResults[0].searchResults[0]._id).toEqual(updatedDocument._id);

    // feature
    updatedDocument = await documentDAO.featureDocument(updatedDocument, project);

    expect(updatedDocument).not.toEqual(null);
    expect(updatedDocument.isFeatured).toEqual(true);

    // unfeature
    updatedDocument = await documentDAO.unfeatureDocument(updatedDocument, project);

    expect(updatedDocument).not.toEqual(null);
    expect(updatedDocument.isFeatured).toEqual(false);

    // download (don't need on a mock, so how to test this?)
    let meta = await documentDAO.downloadDocumentGetMeta(constants.SECURE_ROLES, 'Test User', updatedDocument, 'good_name');
    expect(meta).not.toEqual(null);
    expect(meta.fileName).toEqual('good_name.png');

    // delete
    updatedDocument = await documentDAO.deleteDocument('Test User', updatedDocument);

    expect(updatedDocument).not.toEqual(null);

    //pubDocument = await documentDAO.deleteDocument('Test User', pubDocument);
    // delete the temp documents from Minio as well!
    // public
    //MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, pubDocument.project, pubDocument.internalURL);
    // secure
    MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, updatedDocument.project, updatedDocument.internalURL);
  });
});