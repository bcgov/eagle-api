const defaultLog      = require('winston').loggers.get('default');
const mongoose        = require('mongoose');
const mime            = require('mime-types');
const crypto          = require('crypto');
const fs              = require('fs');
const uploadDir       = process.env.UPLOAD_DIRECTORY || './uploads/';
const constants       = require('../helpers/constants');
const Actions         = require('../helpers/actions');
const Utils           = require('../helpers/utils');
const MinioController = require('../helpers/minio');
const demiPush        = require('../helpers/demiPush');

const ENABLE_VIRUS_SCANNING = process.env.ENABLE_VIRUS_SCANNING ? process.env.ENABLE_VIRUS_SCANNING.toLowerCase() == 'true' : false;

const ALLOWED_FIELDS = [
  'displayName',
  '_addedBy',
  'documentFileName',
  'internalExt',
  'internalOriginalName',
  'labels',
  'documentType',
  'datePosted',
  'dateUploaded',
  'dateReceived',
  'documentFileSize',
  'documentSource',
  'eaoStatus',
  'internalURL',
  'internalMime',
  'internalSize',
  'checkbox',
  'project',
  'type',
  'documentAuthor',
  'documentAuthorType',
  'milestone',
  'projectPhase',
  'legislation',
  'description',
  'keywords',
  'isPublished',
  'isFeatured',
  'sortOrder',
  'publicHitCount',
  'secureHitCount',
  'contentExtractedAt',
  'extractionMethod',
  'contentPageCount'
];

exports.protectedOptions = function (args, res,) {
  res.status(200).send();
};

exports.publicGet = async function (args, res,) {
  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.docId.value, query);
  } else if (args.swagger.params.docIds && args.swagger.params.docIds.value && args.swagger.params.docIds.value.length > 0) {
    query = Utils.buildQuery('_id', args.swagger.params.docIds.value);
  }
  if (args.swagger.params.project && args.swagger.params.project.value) {
    query = Utils.buildQuery('project', args.swagger.params.project.value, query);
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  try {
    var data = await Utils.runDataQuery('Document',
      ['public'],
      query,
      Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS), // Fields
      null, // sort warmup
      null, // sort
      null, // skip
      null, // limit
      false); // count
    defaultLog.info('Got document(s):', data);
    Utils.recordAction('Get', 'Document', 'public', args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.unProtectedPost = async function (args, res) {
  defaultLog.info('Creating new public document object');
  if (args.swagger.params._comment && args.swagger.params._comment.value && !mongoose.Types.ObjectId.isValid(args.swagger.params._comment.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.project && args.swagger.params.project.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.project.value)) {
    return Actions.sendResponse(res, 400, { });
  }

  var _comment = args.swagger.params._comment.value;
  var project = args.swagger.params.project.value;
  var upfile = args.swagger.params.upfile.value;

  // Enforce file size limit of 10MB in RAM
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (upfile.size > MAX_FILE_SIZE) {
    defaultLog.warn('File upload rejected: exceeds 10MB limit (%d bytes)', upfile.size);
    return Actions.sendResponse(res, 400, { message: 'File size exceeds 10MB limit.' });
  }

  // Enforce MIME allow-list
  const allowedMimeTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (!allowedMimeTypes.includes(upfile.mimetype)) {
    defaultLog.warn('File upload rejected: unallowed MIME type (%s)', upfile.mimetype);
    return Actions.sendResponse(res, 400, { message: 'MIME type is not allowed.' });
  }

  var guid = crypto.randomUUID();
  var ext = mime.extension(upfile.mimetype);
  var tempFilePath = uploadDir + guid + '.' + ext;

  try {
    // Virus scan
    if (ENABLE_VIRUS_SCANNING) {
      var scanPassed = await Utils.avScan(upfile.buffer);
      if (!scanPassed) {
        defaultLog.warn('File failed virus check.');
        return Actions.sendResponse(res, 400, { 'message': 'File failed virus check.' });
      }
    }

    // Write to temp file and upload to MinIO
    fs.writeFileSync(tempFilePath, upfile.buffer);
    var minioFile = await MinioController.putDocument(
      MinioController.BUCKETS.DOCUMENTS_BUCKET, project, upfile.originalname, tempFilePath
    );
    fs.unlinkSync(tempFilePath);

    // Save document to MongoDB
    var Document = mongoose.model('Document');
    var doc = new Document();
    doc.project = new mongoose.Types.ObjectId(project);
    doc._comment = new mongoose.Types.ObjectId(_comment);
    doc._addedBy = 'public';
    doc._createdDate = new Date();
    doc.read = ['sysadmin', 'staff'];
    doc.write = ['sysadmin', 'staff'];
    doc.delete = ['sysadmin', 'staff'];

    doc.internalOriginalName = upfile.originalname;
    doc.internalURL = minioFile.path;
    doc.internalExt = minioFile.extension;
    doc.internalSize = upfile.size;
    doc.passedAVCheck = true;
    doc.internalMime = upfile.mimetype;

    doc.documentSource = 'COMMENT';
    doc.displayName = upfile.originalname;
    doc.documentFileName = upfile.originalname;
    doc.dateUploaded = new Date();
    doc.datePosted = new Date();
    doc.documentAuthor = args.body.documentAuthor;
    doc.documentAuthorType = new mongoose.Types.ObjectId(args.body.documentAuthorType);

    try {
      var d = await doc.save();
      defaultLog.info('Saved new document object:', d._id);
      var Comment = mongoose.model('Comment');
      await Comment.updateOne({ _id: _comment }, { $addToSet: { documents: d._id } });
      Utils.recordAction('Post', 'Document', 'public', d._id);
      demiPush.document(d);
      return Actions.sendResponse(res, 200, d);
    } catch (saveError) {
      defaultLog.error('Document save failed, rolling back MinIO:', saveError);
      MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
      return Actions.sendResponse(res, 400, saveError);
    }
  } catch (e) {
    defaultLog.error(`Error in unProtectedPost: ${e.message}`);
    delete e['path'];
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedHead = function (args, res) {
  defaultLog.debug('Roles:', args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.docId.value, query);
  }
  if (args.swagger.params._application && args.swagger.params._application.value) {
    query = Utils.buildQuery('_application', args.swagger.params._application.value, query);
  }
  if (args.swagger.params._comment && args.swagger.params._comment.value) {
    query = Utils.buildQuery('_comment', args.swagger.params._comment.value, query);
  }
  // Unless they specifically ask for it, hide deleted results.
  if (args.swagger.params.isDeleted && args.swagger.params.isDeleted.value != undefined) {
    Object.assign(query, { isDeleted: args.swagger.params.isDeleted.value });
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  Utils.runDataQuery('Document',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    ['_id',
      'read'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    true) // count
    .then(function (data) {
      Utils.recordAction('Head', 'Document', args.swagger.params.auth_payload.preferred_username, args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
      // /api/commentperiod/ route, return 200 OK with 0 items if necessary
      if (!(args.swagger.params.docId && args.swagger.params.docId.value) || (data && data.length > 0)) {
        res.setHeader('x-total-count', data && data.length > 0 ? data[0].total_items : 0);
        return Actions.sendResponse(res, 200, data);
      } else {
        return Actions.sendResponse(res, 404, data);
      }
    });
};

exports.protectedGet = async function (args, res) {
  defaultLog.info('Getting document(s)');
  if (args.swagger.params.docId && args.swagger.params.docId.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var query = {}, skip = null, limit = null, count = false;

  // Build match query if on docId route
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    Object.assign(query, { _id: new mongoose.Types.ObjectId(args.swagger.params.docId.value) });
  } else if (args.swagger.params.docIds && args.swagger.params.docIds.value && args.swagger.params.docIds.value.length > 0) {
    query = Utils.buildQuery('_id', args.swagger.params.docIds.value);
  }

  if (args.swagger.params.project && args.swagger.params.project.value) {
    query = Utils.buildQuery('project', args.swagger.params.project.value, query);
  }

  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  try {
    var data = await Utils.runDataQuery('Document',
      args.swagger.params.auth_payload.realm_access.roles,
      query,
      Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS), // Fields
      null, // sort warmup
      null, // sort
      skip, // skip
      limit, // limit
      count); // count
    Utils.recordAction('Get', 'Document', args.swagger.params.auth_payload.preferred_username, args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
    defaultLog.info('Got document(s):', data);
    return Actions.sendResponse(res, 200, data);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.publicDownload = function (args, res) {
  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.docId.value, query);
  } else {
    return Actions.sendResponse(res, 404, {});
  }
  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  Utils.runDataQuery('Document',
    ['public'],
    query,
    ['internalURL', 'documentFileName', 'internalMime', 'internalExt'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    false) // count
    .then(function (data) {
      if (data && data.length === 1) {
        var blob = data[0];

        // Make the filename returned match dislplay name, not blob name
        // make sure the filename is VALID!
        // Add project name to front, date uploaded to back if it will fit! 240 chars max

        var fileName = blob.documentFileName;
        var fileType = blob.internalExt;
        if (fileName.slice(- fileType.length) !== fileType) {
          fileName = fileName + '.' + fileType;
        }
        var fileMeta;

        // Allow override
        if (args.swagger.params.filename) {
          fileName = args.swagger.params.filename.value;
        }

        // clean the filename
        fileName = encodeURIComponent(fileName).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\\/g, '_').replace(/\//g, '_').replace(/%2F/g, '_').replace(/ /g, '_');
        // update document public hit count

        mongoose.model('Document').findById(args.swagger.params.docId.value)
          .then(doc => {
            doc.publicHitCount++;
            doc.save();
          });

        // check if the file exists in Minio
        return MinioController.statObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL)
          .then(function (objectMeta) {
            fileMeta = objectMeta;
            // get the download URL
            return MinioController.getPresignedGETUrl(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL);
          }, function () {
            return Actions.sendResponse(res, 404, {});
          })
          .then(function (docURL) {
            // Rejection handler already sent 404 (real MinIO, file not found) — bail out.
            if (res.headersSent) return;
            // Mock MinIO: statObject resolved with undefined instead of rejecting.
            if (!fileMeta) {
              return Actions.sendResponse(res, 404, {});
            }
            Utils.recordAction('Download', 'Document', 'public', args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
            
            const allowedInlineMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
            let contentType = fileMeta.metaData['content-type'] || 'application/octet-stream';
            let disposition = 'inline';

            if (!allowedInlineMimes.includes(contentType)) {
              contentType = 'application/octet-stream';
              disposition = 'attachment';
            }

            res.setHeader('Content-Length', fileMeta.size);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', disposition + ';filename="' + fileName + '"');
            return Utils.getUrlAsStream(docURL)
              .then(stream => stream.pipe(res));
          });
      } else {
        return Actions.sendResponse(res, 404, {});
      }
    });
};

exports.protectedDownload = function (args, res) {
  var self = this;
  self.scopes = args.swagger.params.auth_payload.realm_access.roles;

  defaultLog.debug('Roles:', args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.docId.value, query);
  }
  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  Utils.runDataQuery('Document',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    ['internalURL', 'documentFileName', 'internalMime', 'internalExt'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    false) // count
    .then(function (data) {
      if (data && data.length === 1) {
        var blob = data[0];

        var fileName = blob.documentFileName;
        var fileType = blob.internalExt;
        if (fileName.slice(- fileType.length) !== fileType) {
          fileName = fileName + '.' + fileType;
        }
        var fileMeta;

        // update document secure hit count
        mongoose.model('Document').findById(args.swagger.params.docId.value)
          .then(doc => {
            doc.secureHitCount++;
            doc.save();
          });

        // check if the file exists in Minio
        return MinioController.statObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL)
          .then(function (objectMeta) {
            fileMeta = objectMeta;
            // get the download URL
            return MinioController.getPresignedGETUrl(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL);
          }, function () {
            return Actions.sendResponse(res, 404, {});
          })
          .then(function (docURL) {
            // Rejection handler already sent 404 (real MinIO, file not found) — bail out.
            if (res.headersSent) return;
            // Mock MinIO: statObject resolved with undefined instead of rejecting.
            if (!fileMeta) {
              return Actions.sendResponse(res, 404, {});
            }
            Utils.recordAction('Download', 'Document', args.swagger.params.auth_payload.preferred_username, args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
            // stream file from Minio to client
            res.setHeader('Content-Length', fileMeta.size);
            res.setHeader('Content-Type', fileMeta.metaData['content-type']);
            res.setHeader('Content-Disposition', 'attachment;filename="' + encodeURIComponent(fileName) + '"');
            return Utils.getUrlAsStream(docURL)
              .then(stream => stream.pipe(res));
          });
      } else {
        return Actions.sendResponse(res, 404, {});
      }
    });
};

exports.protectedOpen = function (args, res) {
  var self = this;
  self.scopes = args.swagger.params.auth_payload.realm_access.roles;

  defaultLog.debug('Roles:', args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on docId route
  var query = {};
  if (args.swagger.params.docId && args.swagger.params.docId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.docId.value, query);
  }
  // Set query type
  Object.assign(query, { '_schemaName': 'Document' });

  Utils.runDataQuery('Document',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    ['internalURL', 'documentFileName', 'internalMime', 'internalExt'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    false) // count
    .then(function (data) {
      if (data && data.length === 1) {
        var blob = data[0];

        var fileName = blob.documentFileName;
        var fileType = blob.internalExt;
        if (fileName.slice(- fileType.length) !== fileType) {
          fileName = fileName + '.' + fileType;
        }

        // Allow override
        if (args.swagger.params.filename) {
          fileName = args.swagger.params.filename.value;
        }

        var fileMeta;

        // update document secure hit count
        mongoose.model('Document').findById(args.swagger.params.docId.value)
          .then(doc => {
            doc.secureHitCount++;
            doc.save();
          });

        // check if the file exists in Minio
        return MinioController.statObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL)
          .then(function (objectMeta) {
            fileMeta = objectMeta;
            // get the download URL
            return MinioController.getPresignedGETUrl(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL);
          }, function () {
            return Actions.sendResponse(res, 404, {});
          })
          .then(function (docURL) {
            if (fileMeta) {
              Utils.recordAction(
                'Open',
                'Document',
                args.swagger.params.auth_payload.preferred_username,
                args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null
              );
              const allowedInlineMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
              let contentType = fileMeta.metaData['content-type'] || 'application/octet-stream';
              let disposition = 'inline';

              if (!allowedInlineMimes.includes(contentType)) {
                contentType = 'application/octet-stream';
                disposition = 'attachment';
              }

              res.setHeader('Content-Length', fileMeta.size);
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Disposition', disposition + ';filename="' + fileName + '"');

              return Utils.getUrlAsStream(docURL)
                .then(stream => stream.pipe(res));
            }
          });
      } else {
        return Actions.sendResponse(res, 404, {});
      }
    });
};

//  Create a new document
exports.protectedPost = async function (args, res) {
  defaultLog.info('Creating new protected document object');
  var project = args.swagger.params.project.value;
  var _comment = args.swagger.params._comment.value;

  if (args.swagger.params._comment && args.swagger.params._comment.value && !mongoose.Types.ObjectId.isValid(_comment)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.project && args.swagger.params.project.value && !mongoose.Types.ObjectId.isValid(project)) {
    return Actions.sendResponse(res, 400, { });
  }

  var upfile = args.swagger.params.upfile.value;
  const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
  if (upfile.size > MAX_FILE_SIZE) {
    defaultLog.warn('Protected file upload rejected: exceeds 3GB limit (%d bytes)', upfile.size);
    return Actions.sendResponse(res, 400, { message: 'File size exceeds 3GB limit.' });
  }

  var guid = crypto.randomUUID();
  var ext = mime.extension(upfile.mimetype);
  var tempFilePath = uploadDir + guid + '.' + ext;

  try {
    // Virus scan
    if (ENABLE_VIRUS_SCANNING) {
      var scanPassed = await Utils.avScan(upfile.buffer);
      if (!scanPassed) {
        defaultLog.warn('File failed virus check.');
        return Actions.sendResponse(res, 400, { 'message': 'File failed virus check.' });
      }
    }

    // Write to temp file and upload to MinIO
    fs.writeFileSync(tempFilePath, upfile.buffer);
    var minioFile = await MinioController.putDocument(
      MinioController.BUCKETS.DOCUMENTS_BUCKET, project, args.swagger.params.documentFileName.value, tempFilePath
    );
    fs.unlinkSync(tempFilePath);

    // Build document model
    var Document = mongoose.model('Document');
    var doc = new Document();
    doc.project = new mongoose.Types.ObjectId(project);
    doc._comment = _comment;
    doc._addedBy = args.swagger.params.auth_payload.preferred_username;
    doc._createdDate = new Date();
    doc.read = ['sysadmin', 'staff'];
    doc.write = ['sysadmin', 'staff'];
    doc.delete = ['sysadmin', 'staff'];

    doc.documentFileName = args.swagger.params.documentFileName.value;
    doc.internalOriginalName = args.swagger.params.internalOriginalName.value;
    doc.internalURL = minioFile.path;
    doc.internalExt = minioFile.extension;
    doc.internalSize = upfile.size;
    doc.passedAVCheck = true;
    doc.internalMime = upfile.mimetype;

    let formattedLeg = null;
    if ((args.swagger.params.legislation && typeof args.swagger.params.legislation.value === 'string') ||
        (args.swagger.params.legislation && typeof args.swagger.params.legislation.value === 'number')) {
      formattedLeg = parseInt(args.swagger.params.legislation.value, 10);
    }
    doc.legislation = formattedLeg;

    doc.documentSource = args.swagger.params.documentSource.value;

    doc.displayName = args.swagger.params.displayName.value;
    if (args.swagger.params.eaoStatus && args.swagger.params.eaoStatus.value) {
      doc.eaoStatus = args.swagger.params.eaoStatus.value;
      if (args.swagger.params.eaoStatus.value == 'Published') {
        doc.read.push('public');
      }
    } else {
      doc.eaoStatus = null;
    }

    if (args.swagger.params.publish && args.swagger.params.publish.value === true) {
      doc.read.push('public');
    }

    doc.milestone = args.swagger.params.milestone.value && args.swagger.params.milestone.value !== "null" ? new mongoose.Types.ObjectId(args.swagger.params.milestone.value) : null;
    doc.type = args.swagger.params.type.value && args.swagger.params.type.value !== "null" ? new mongoose.Types.ObjectId(args.swagger.params.type.value) : null;
    doc.documentAuthor = args.swagger.params.documentAuthor.value && args.swagger.params.documentAuthor.value !== "null" ? args.swagger.params.documentAuthor.value : null;
    doc.documentAuthorType = args.swagger.params.documentAuthorType.value && args.swagger.params.documentAuthorType.value !== "null" ? new mongoose.Types.ObjectId(args.swagger.params.documentAuthorType.value) : null;
    doc.dateUploaded = args.swagger.params.dateUploaded.value;
    doc.datePosted = args.swagger.params.datePosted.value;
    doc.description = args.swagger.params.description.value;
    doc.projectPhase = args.swagger.params.projectPhase.value && args.swagger.params.projectPhase.value !== "null" ? new mongoose.Types.ObjectId(args.swagger.params.projectPhase.value) : null;

    try {
      var d = await doc.save();
      defaultLog.info('Saved new document object:', d._id);
      Utils.recordAction('Post', 'Document', args.swagger.params.auth_payload.preferred_username, d._id);
      demiPush.document(d);
      return Actions.sendResponse(res, 200, d);
    } catch (saveError) {
      defaultLog.error('Document save failed, rolling back MinIO:', saveError);
      MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
      return Actions.sendResponse(res, 400, saveError);
    }
  } catch (e) {
    defaultLog.error(`Error in protectedPost: ${e.message}`);
    delete e['path'];
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedPublish = async function (args, res) {
  var objId = args.swagger.params.docId.value;
  defaultLog.info('Publish Document:', objId);
  if (args.swagger.params.docId && args.swagger.params.docId.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var Document = require('mongoose').model('Document');
  try {
    var document = await Document.findOne({ _id: objId });
    if (document) {
      // Authz check: Check if user roles intersect with project write roles or if user is sysadmin/staff
      const userRoles = args.swagger.params.auth_payload.realm_access.roles;
      const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
      if (!isAuthorized) {
        return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to publish document' });
      }

      defaultLog.info('Document:', document);
      document.eaoStatus = 'Published';
      var published = await Actions.publish(await document.save());
      Utils.recordAction('Publish', 'Document', args.swagger.params.auth_payload.preferred_username, objId);
      demiPush.document(published);
      return Actions.sendResponse(res, 200, published);
    } else {
      defaultLog.info('Couldn\'t find that document!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedUnPublish = async function (args, res) {
  var objId = args.swagger.params.docId.value;
  defaultLog.info('UnPublish Document:', objId);
  if (args.swagger.params.docId && args.swagger.params.docId.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var Document = require('mongoose').model('Document');
  try {
    var document = await Document.findOne({ _id: objId });
    if (document) {
      // Authz check: Check if user roles intersect with project write roles or if user is sysadmin/staff
      const userRoles = args.swagger.params.auth_payload.realm_access.roles;
      const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
      if (!isAuthorized) {
        return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to unpublish document' });
      }

      defaultLog.info('Document:', document);
      document.eaoStatus = 'Rejected';
      var unPublished = await Actions.unPublish(await document.save());
      Utils.recordAction('Unpublish', 'Document', args.swagger.params.auth_payload.preferred_username, objId);
      demiPush.document(unPublished);
      return Actions.sendResponse(res, 200, unPublished);
    } else {
      defaultLog.info('Couldn\'t find that document!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing document
exports.protectedPut = async function (args, res) {
  defaultLog.debug('protectedPut params: %j', args.swagger.params);
  var objId = args.swagger.params.docId.value;
  if (args.swagger.params.docId && args.swagger.params.docId.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.milestone && args.swagger.params.milestone.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.milestone.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.type && args.swagger.params.type.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.type.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.documentAuthorType && args.swagger.params.documentAuthorType.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.documentAuthorType.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  if (args.swagger.params.projectPhase && args.swagger.params.projectPhase.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.projectPhase.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var obj = {};
  defaultLog.info('Put document:', objId);

  obj._updatedBy = args.swagger.params.auth_payload.preferred_username;

  if (args.swagger.params.displayName && args.swagger.params.displayName.value ) {
    obj.displayName = args.swagger.params.displayName.value;
  }
  if ( args.swagger.params.milestone && args.swagger.params.milestone.value ) {
    obj.milestone = new mongoose.Types.ObjectId(args.swagger.params.milestone.value);
  }
  if ( args.swagger.params.type && args.swagger.params.type.value ) {
    obj.type = new mongoose.Types.ObjectId(args.swagger.params.type.value);
  }
  if ( args.swagger.params.documentAuthorType && args.swagger.params.documentAuthorType.value ) {
    obj.documentAuthorType = new mongoose.Types.ObjectId(args.swagger.params.documentAuthorType.value);
  }
  if ( args.swagger.params.projectPhase && args.swagger.params.projectPhase.value ) {
    obj.projectPhase = new mongoose.Types.ObjectId(args.swagger.params.projectPhase.value);
  }
  if ( args.swagger.params.dateUploaded && args.swagger.params.dateUploaded.value ) {
    obj.dateUploaded = args.swagger.params.dateUploaded.value;
  }
  if ( args.swagger.params.datePosted && args.swagger.params.datePosted.value ) {
    obj.datePosted = args.swagger.params.datePosted.value;
  }
  if ( args.swagger.params.description && args.swagger.params.description.value ) {
    obj.description = args.swagger.params.description.value;
  }
  if ( args.swagger.params.keywords && args.swagger.params.keywords.value ) {
    obj.keywords = args.swagger.params.keywords.value;
  }
  if ( args.swagger.params.legislation && args.swagger.params.legislation.value ) {
    obj.legislation = parseInt(args.swagger.params.legislation.value, 10);
  }
  // only order application documents for now
  if ( args.swagger.params.sortOrder && args.swagger.params.sortOrder.value ) {
    obj.sortOrder = args.swagger.params.sortOrder.value;
  }
  if ( args.swagger.params.eaoStatus && args.swagger.params.eaoStatus.value ){
    obj.eaoStatus = args.swagger.params.eaoStatus.value;
  }
  if (args.swagger.params.eaoStatus && args.swagger.params.eaoStatus.value === 'Published') {
    obj.read = ['public', 'staff', 'sysadmin'];
  } else if (args.swagger.params.eaoStatus && args.swagger.params.eaoStatus.value === 'Rejected') {
    obj.read = ['staff', 'sysadmin'];
  }

  // TODO Not Yet
  // obj.labels = JSON.parse(args.swagger.params.labels.value);

  defaultLog.info('ObjectID:', objId);

  // Update who did this?

  var Document = mongoose.model('Document');

  try {
    var existingDoc = await Document.findById(objId);
    if (!existingDoc) {
      return Actions.sendResponse(res, 404, {});
    }

    const userRoles = args.swagger.params.auth_payload.realm_access.roles;
    const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
    if (!isAuthorized) {
      return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to modify document' });
    }

    var doc = await Document.findOneAndUpdate({ _id: objId }, obj, { upsert: false, returnDocument: 'after' });
    if (doc) {
      Utils.recordAction('put', 'document', args.swagger.params.auth_payload.preferred_username, objId);
      defaultLog.info('Document updated:', doc);
      demiPush.document(doc);
      return Actions.sendResponse(res, 200, doc);
    } else {
      defaultLog.info('Couldn\'t find that object!');
      return Actions.sendResponse(res, 404, {});
    }
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

//  Delete a Document
exports.protectedDelete = async function (args, res) {
  var objId = args.swagger.params.docId.value;
  defaultLog.info('Delete Document:', objId);
  if (args.swagger.params.docId && args.swagger.params.docId.value && !mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
    return Actions.sendResponse(res, 400, { });
  }
  var Document = require('mongoose').model('Document');
  try {
    var existingDoc = await Document.findById(objId);
    if (!existingDoc) {
      return Actions.sendResponse(res, 404, {});
    }

    const userRoles = args.swagger.params.auth_payload.realm_access.roles;
    const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
    if (!isAuthorized) {
      return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to delete document' });
    }

    var doc = await Document.findOneAndDelete({ _id: objId });
    defaultLog.info('Deleting document %s from minio', doc && doc.internalURL);
    await MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
    Utils.recordAction('Delete', 'Document', args.swagger.params.auth_payload.preferred_username, objId);
    return Actions.sendResponse(res, 200, {});
  } catch (e) {
    defaultLog.error('Error deleting document %s: %s', objId, e.message);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.featureDocument = async function (args, res) {
  try {
    if (args.swagger.params.docId && args.swagger.params.docId.value) {
      if (!mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
        return Actions.sendResponse(res, 400, { });
      }
      let document = await mongoose.model('Document').findById(new mongoose.Types.ObjectId(args.swagger.params.docId.value));
      if (!document) {
        return Actions.sendResponse(res, 404, { status: 404, message: 'Document does not exist'});
      }

      const userRoles = args.swagger.params.auth_payload.realm_access.roles;
      const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
      if (!isAuthorized) {
        return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to modify document' });
      }

      let project = await mongoose.model('Project').findById(new mongoose.Types.ObjectId(document.project));

      if(project) {
        let featuredDocumentsCount = await mongoose.model('Document').countDocuments({ project: project._id, isFeatured: true });

        // Move the magic number into a config
        if(featuredDocumentsCount < constants.MAX_FEATURE_DOCS) {
          document.isFeatured = true;
          let result = await document.save();

          demiPush.document(result);
          return Actions.sendResponse(res, 200, result);
        } else {
          return Actions.sendResponse(res, 403, { status: 403, message: 'Feature document limit reached', limit: constants.MAX_FEATURE_DOCS});
        }
      }
    }

    return Actions.sendResponse(res, 404, { status: 404, message: 'Document does not exist'});
  } catch(e) {
    return Actions.sendResponse(res, 500, {});
  }
};

exports.unfeatureDocument = async function (args, res) {
  try {
    if (args.swagger.params.docId && args.swagger.params.docId.value) {
      if (!mongoose.Types.ObjectId.isValid(args.swagger.params.docId.value)) {
        return Actions.sendResponse(res, 400, { });
      }
      let document = await mongoose.model('Document').findById(new mongoose.Types.ObjectId(args.swagger.params.docId.value));
      if (!document) {
        return Actions.sendResponse(res, 404, {});
      }

      const userRoles = args.swagger.params.auth_payload.realm_access.roles;
      const isAuthorized = userRoles.includes('sysadmin') || userRoles.includes('staff');
      if (!isAuthorized) {
        return Actions.sendResponse(res, 403, { message: 'Access Denied: Insufficient permissions to modify document' });
      }

      document.isFeatured = false;
      let result = await document.save();

      demiPush.document(result);
      return Actions.sendResponse(res, 200, result);
    }

    return Actions.sendResponse(res, 404, {});
  } catch(e) {
    return Actions.sendResponse(res, 500, {});
  }
};
