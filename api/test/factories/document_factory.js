const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const moment = require('moment');
const app_helper = require('../../../app_helper');
const Document = require('../../helpers/models/document');
const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const MinioController = require('../../helpers/minio');
let defaultLog = app_helper.defaultLog;
let faker = require('faker/locale/en');

const factoryName = Document.modelName;

const docProps = [
    { ext: "jpg", mime: "image/jpeg" }
  , { ext: "jpeg", mime: "image/jpeg" }
  , { ext: "gif", mime: "image/gif" }
  , { ext: "png", mime: "image/png" }
  , { ext: "bmp", mime: "image/bmp" }
  , { ext: "doc", mime: "application/msword" }
  , { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
  , { ext: "xls", mime: "application/vnd.ms-excel" }
  , { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  , { ext: "ppt", mime: "application/vnd.ms-powerpoint" }
  , { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
  , { ext: "pdf", mime: "application/pdf" }
  , { ext: "txt", mime: "text/plain" }
];

factory.define(factoryName, Document, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let listsPool = (buildOptions.pipeline) ? 
    (buildOptions.pipeline.lists) ? buildOptions.pipeline.lists : null :
    (buildOptions.listsPool) ? buildOptions.listsPool : null;
  const doctypes = (null == listsPool) ? [] : listsPool.filter(listEntry => "doctype" === listEntry.type);
  const authors = (null == listsPool) ? [] : listsPool.filter(listEntry => "author" === listEntry.type);
  const labels = (null == listsPool) ? [] : listsPool.filter(listEntry => "label" === listEntry.type);
  const projectPhases = (null == listsPool) ? [] : listsPool.filter(listEntry => "projectPhase" === listEntry.type);

  let author = factory_helper.generateFakePerson();
  let updator = faker.random.arrayElement([null, author, factory_helper.generateFakePerson()]);
  let deletor = faker.random.arrayElement([null, author, updator, factory_helper.generateFakePerson()]);

  let datePosted = moment(faker.date.past(10, new Date()));
  let updatedDate = (null == updator) ? null : datePosted.clone().subtract(faker.random.number(45), 'days');
  let dateUploaded = (null == updator) ? datePosted.clone().subtract(faker.random.number(15), 'days') : updatedDate.clone().subtract(faker.random.number(15), 'days');
  let createdDate = dateUploaded.clone().subtract(faker.random.number(15), 'days');

  let docTypeSettings = faker.random.arrayElement(docProps);
  let displayName = factory.seq('Document.displayName', (n) => `Test Document ${n}`);

  let numberOfLabels = faker.random.number(5);
  let distinctLabelsForThisDoc = [];
  for (let i = 0; i < numberOfLabels; i++) {
    let label = factory_helper.getRandomExistingListElementName(labels);
    if (distinctLabelsForThisDoc[label]) continue;
    distinctLabelsForThisDoc.push(label);
  }
  
  let projectId = factory_helper.ObjectId();
  let userUploadedFileName = generateOriginalFileName(faker, docTypeSettings.ext);
  let minioFileSystemFileName = factory_helper.hexaDecimal(32).toLocaleLowerCase() + "." + docTypeSettings.ext;
  let eaoStatus = faker.random.arrayElement(["", "Published", "Rejected"]);

  let attrs = {
      _id              : factory_helper.ObjectId()

    , project          : projectId

    // Tracking
    , _comment         : factory_helper.ObjectId()  // field is not present for document source PROJECT, only added when is COMMENT.  see below instead
    , _createdDate     : createdDate
    , _updatedDate     : updatedDate
    , _addedBy         : author.idir
    , _updatedBy       : (null == updator) ? null : updator.idir
    , _deletedBy       : (null == deletor) ? null : deletor.idir

    // Note: Default on tag property is purely for display only, they have no real effect on the model
    // This must be done in the code.
    , read             : ("Published" == eaoStatus) ? ["public", "sysadmin", "staff"] : ["sysadmin", "staff"] 
    , write            : ["sysadmin", "staff"]
    , delete           : ["sysadmin", "staff"]

    // Not editable
    , documentFileName : userUploadedFileName
    , internalOriginalName : userUploadedFileName  // field is not present for document source PROJECT, only added when is COMMENT.  see below instead
    , internalURL      : projectId + "/" + minioFileSystemFileName
    , internalExt      : docTypeSettings.ext
    , internalSize     : faker.random.number({min:20000, max:250000000})  // staff upload some big docx's and pptx's
    , passedAVCheck    : (faker.random.number(100) < 5)  // 5% fail
    , internalMime     : docTypeSettings.mime

    // META
    , documentSource   : faker.random.arrayElement(["COMMENT", "DROPZONE", "PROJECT"])

    // Pre-filled with documentFileName in the UI
    , displayName      : displayName
    , milestone        : faker.random.arrayElement([null, factory_helper.ObjectId()])
    , dateUploaded     : dateUploaded
    , datePosted       : datePosted
    , type             : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(doctypes))
    , description      : faker.lorem.sentence()
    , documentAuthor   : author.fullName
    , documentAuthorType   : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(authors))
    , projectPhase     : factory_helper.ObjectId(factory_helper.getRandomExistingMongoId(projectPhases))
    , eaoStatus        : eaoStatus
    , keywords         : ""
    , labels           : distinctLabelsForThisDoc
    , publicHitCount   : faker.random.number()
    , secureHitCount   : faker.random.number()
  };

  return attrs;
});

// because documents are so overloaded, sometimes we get fields that shouldn't be there after running physical file generation
function fixFields(mongooseDoc) {
  return new Promise(function(resolve, reject) {
    if ("COMMENT" != mongooseDoc.documentSource) {
      let command = {$unset: {_comment: 1, internalOriginalName: 1 }};
      let query = {'_id' : mongooseDoc._id};
      Document.findOneAndUpdate(query, command, {upsert: false, new: true, useFindAndModify: false}, function(err, doc) {
        if (err) {
          defaultLog.error(JSON.stringify(err));
          resolve();
        }
        resolve(doc);
      });
    } else {
      resolve(mongooseDoc);
    }
  });
}

function generatePhysicalFile(faker, generateFiles, persistFiles, mongooseDoc) {
  return new Promise(function(resolve, reject) {
    let editableDocument = mongooseDoc.toObject();
    if (editableDocument._id) delete editableDocument._id;
    if (editableDocument.id) delete editableDocument.id;
    editableDocument.internalExt = "pdf";
    editableDocument.internalMime = "application/pdf";
    editableDocument.internalURL = editableDocument.project + "/" + factory_helper.hexaDecimal(32).toLocaleLowerCase() + "." + editableDocument.internalExt;
    editableDocument.passedAVCheck = true;
    let userUploadedFileName = generateOriginalFileName(faker, editableDocument.internalExt);
    editableDocument.displayName = userUploadedFileName;
    editableDocument.documentFileName = userUploadedFileName;
    let templatePath = faker.random.arrayElement([factory_helper.generatedDocSamples.S, factory_helper.generatedDocSamples.M, factory_helper.generatedDocSamples.L]); 
    let stats = fs.statSync(templatePath);
    editableDocument.internalSize = stats["size"];

    if ("COMMENT" == editableDocument.documentSource) {
      // these fields are completely absent unless the document comes from a comment
      editableDocument.internalOriginalName = userUploadedFileName;
    } 

    let projectDocTempPath = factory_helper.epicAppTmpBasePath + editableDocument.project + path.sep;
    shell.mkdir('-p', projectDocTempPath);
    
    let query = {'_id' : mongooseDoc._id};

    if (generateFiles) {
      let guid = faker.random.number({min:1000000000000000000, max:9999999999999999999}).toString()  // eg. 6628723481510936576
      
      let tempFilePath = projectDocTempPath + guid + "." + editableDocument.internalExt;
      fs.copyFileSync(templatePath, tempFilePath);
      factory_helper.touchPath(tempFilePath);
      return MinioController
      .putDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, editableDocument.project.toString(), userUploadedFileName, tempFilePath)
      .then(async function (minioFile) {
        editableDocument.internalURL = minioFile.path;
        defaultLog.verbose("Successfully uploaded file to " + editableDocument.internalURL);
        Document.findOneAndUpdate(query, editableDocument, {upsert: false, new: true, useFindAndModify: false}, function(err, doc) {
          if (err) {
            defaultLog.error(JSON.stringify(err));
            resolve();
          }
          return resolve(doc);
        });
      })
      .catch(function (error) {
        defaultLog.error("MinioController.BUCKETS.DOCUMENTS_BUCKET = '" + MinioController.BUCKETS.DOCUMENTS_BUCKET + "'"
         + ", MinioController.host = '" + MinioController.host + "'"
         + ", MinioController.port = '" + MinioController.port + "'"
         + ", MinioController.protocol = '" + MinioController.protocol + "'"
         + ", project = '" + editableDocument.project.toString() + "'"
         + ", userUploadedFileName = '" + userUploadedFileName + "'"
         + ", tempFilePath = '" + tempFilePath + "'"
         + ", error = '" + error + "'\n");
        Document.findOneAndUpdate(query, editableDocument, {upsert: false, new: true, useFindAndModify: false}, function(err, doc) {
          if (err) {
            defaultLog.error(JSON.stringify(err));
            resolve();
          }
          return resolve(doc);
        });
      })
      .finally(function(){
        // remove file from temp folder
        if (!persistFiles) fs.unlinkSync(tempFilePath, () => {});
      });
    }
    Document.findOneAndUpdate(query, editableDocument, {upsert: false, new: true, useFindAndModify: false}, function(err, doc) {
      if (err) {
        defaultLog.error(JSON.stringify(err));
        resolve();
      }
      return resolve(doc);
    });
  });
}

function generateOriginalFileName(faker, ext) {
  return faker.lorem.sentence().replace(/\.$/g, '') + "." + ext;
}

exports.factory = factory;
exports.name = factoryName;
exports.MinioControllerBucket = MinioController.BUCKETS.DOCUMENTS_BUCKET;
exports.generatePhysicalFile = generatePhysicalFile;
exports.generateOriginalFileName = generateOriginalFileName;
exports.fixFields = fixFields;