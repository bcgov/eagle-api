const factory = require('factory-girl').factory;
const faker = require('faker');
const factory_helper = require('./factory_helper');
const Document = require('../../helpers/models/document');

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

factory.define('document', Document, buildOptions => {
  let author = factory_helper.generateFakePerson();
  let updator = faker.random.arrayElement([null, author, factory_helper.generateFakePerson()]);
  let deletor = faker.random.arrayElement([null, author, updator, factory_helper.generateFakePerson()]);

  let datePosted = moment(faker.date.past(10, new Date()));
  let dateUploaded = datePosted.clone().subtract(faker.random.number(45), 'days');

  let docTypeSettings = faker.random.arrayElement(docProps);
  let displayName = factory.seq('Document.displayName', (n) => `Test Document ${n}`);

  let minioFileSystemFileName = faker.random.number({min:999999999999, max:10000000000000}) + "_" + (faker.random.alphaNumeric(60)).toLowerCase() + "." + docTypeSettings.ext;

  if (0 == updator.length) updatedDate = null;

  let attrs = {
      project         : require('mongoose').Types.ObjectId()

    // Tracking
    , _comment        : require('mongoose').Types.ObjectId()
    , _createdDate    : createdDate
    , _updatedDate    : updatedDate
    , _addedBy        : author.idir
    , _updatedBy      : updator.idir
    , _deletedBy      : deletor.idir

    // Note: Default on tag property is purely for display only, they have no real effect on the model
    // This must be done in the code.
    , read             : '["project-admin", "project-intake", "project-team", "project-system-admin"]'
    , write            : '["project-admin", "project-intake", "project-team", "project-system-admin"]'
    , delete           : '["project-admin", "project-intake", "project-team", "project-system-admin"]'

    // Not editable
    , documentFileName : faker.lorem.sentence() + "." + docTypeSettings.ext
    , internalOriginalName : minioFileSystemFileName
    , internalURL      : "etl/the-project-name/" + minioFileSystemFileName
    , internalExt      : docTypeSettings.ext
    , internalSize     : faker.random.number({min:20000, max:250000000})  // staff upload some big docx's and pptx's
    , passedAVCheck    : (faker.random.number(100) < 5)  // 5% fail
    , internalMime     : docTypeSettings.mime

    // META
    , documentSource   : faker.random.arrayElement(["COMMENT", "DROPZONE", "PROJECT"])

    // Pre-filled with documentFileName in the UI
    , displayName      : displayName
    , milestone        : faker.random.arrayElement([null, require('mongoose').Types.ObjectId()])
    , dateUploaded     : dateUploaded
    , datePosted       : datePosted
    , type             : require('mongoose').Types.ObjectId()
    , description      : faker.lorem.sentence()
    , documentAuthor   : author.fullName
    , documentAuthorType   : require('mongoose').Types.ObjectId()
    , projectPhase     : require('mongoose').Types.ObjectId()
    , eaoStatus        : faker.random.arrayElement(["", "Published", "Rejected"])
    , keywords         : ""

    // TODO generate more meaningful meta 
    // eg ["Under Review","Public Comments/Submissions","(2nd Public Comment Period) Email dated May 13/05 from PersonName1 and PersonName2 (Delta BC) with comments regarding the truck traffic and the port."]
    , labels           : [faker.lorem.sentence(), faker.lorem.sentence(), faker.lorem.sentence()]
  };
  return attrs;
});

exports.factory = factory;
