const defaultLog      = require('winston').loggers.get('default');
const mongoose        = require('mongoose');
const Actions         = require('../helpers/actions');
const Utils           = require('../helpers/utils');
const intformat       = require('biguint-format');
const FlakeIdGen      = require('flake-idgen');
const uploadDir       = process.env.UPLOAD_DIRECTORY || "./uploads/";
const MinioController = require('../helpers/minio');
const constants       = require('../helpers/constants');
const _               = require('lodash');
const fs              = require('fs');

const generator = new FlakeIdGen;
const ENABLE_VIRUS_SCANNING = process.env.ENABLE_VIRUS_SCANNING || false;

exports.documentHateoas = function(document, roles) {
  document.links =
    [
      { rel: 'self', title: 'public self', type: 'GET', href: '/api/v2/Public/Documents/' + document._id },
      { rel: 'fetch', title: 'Public Document Download', method: 'GET', href: '/api/v2/Public/Documents/' + document._id + '/Download' }
    ];

  if (roles && roles.length > 0 && (roles.includes('sysadmin') || roles.includes('staff'))) {
    document.links.push({ rel: 'self', title: 'secure self', method: 'GET', href: '/api/v2/Documents/' + document._id });
    document.links.push({ rel: 'update', title: 'secure Document Update', method: 'PUT', href: '/api/v2/Documents/' + document._id });
    document.links.push({ rel: 'delete', title: 'secure Document Delete', method: 'DELETE', href: '/api/v2/Documents/' + document._id });
    document.links.push({ rel: 'update', title: 'secure Document Publish', method: 'GET', href: '/api/v2/Documents/' + document._id + '/Publish' });
    document.links.push({ rel: 'update', title: 'secure Document UnPublish', method: 'GET', href: '/api/v2/Documents/' + document._id + '/Unpublish' });
    document.links.push({ rel: 'update', title: 'secure Document Feature', method: 'GET', href: '/api/v2/Documents/' + document._id + '/Feature'});
    document.links.push({ rel: 'update', title: 'secure Document UnFeature', method: 'GET', href: '/api/v2/Documents/' + document._id + '/Unfeature' });
    document.links.push({ rel: 'fetch', title: 'secure Document Download', method: 'GET', href: '/api/v2/Documents/' + document._id + '/Download' });
  }

  return document;
};

exports.createDocument = async function(userName, projectId, comment, uploadedFile, ext, documentDetails, isPublic) {
  let guid = intformat(generator.next(), 'dec');
  let tempFilePath = uploadDir + guid + "." + ext;

  try {
    let virusScanSuccessful = true;

    if (ENABLE_VIRUS_SCANNING || ENABLE_VIRUS_SCANNING == 'true') {
      virusScanSuccessful = Utils.avScan(uploadedFile.buffer);
    }

    if (!virusScanSuccessful) {
      defaultLog.warn("File failed virus check.");
      throw Error('File failed virus check.');
    } else {
      defaultLog.debug('Writing temp document file...');

      fs.writeFileSync(tempFilePath, uploadedFile.buffer);

      defaultLog.debug('Completed writing file. Starting Minio');
      defaultLog.debug(MinioController.BUCKETS.DOCUMENTS_BUCKET, mongoose.Types.ObjectId(projectId), documentDetails.fileName, tempFilePath);

      let minioFile = await MinioController.putDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, projectId, documentDetails.fileName, tempFilePath);

      defaultLog.debug("putDocument:", minioFile);
      defaultLog.debug('Deleting temp document file...');

      fs.unlinkSync(tempFilePath);

      defaultLog.debug('Deleted! Starting to create document resource');

      let documentModel = mongoose.model('Document');
      let document = new documentModel();
      // Metadata
      document.project              = mongoose.Types.ObjectId(projectId);
      document._comment             = comment;
      document._addedBy             = userName;
      document._createdDate         = new Date();
      document.read                 = ['sysadmin', 'staff'];
      document.write                = ['sysadmin', 'staff'];
      document.delete               = ['sysadmin', 'staff'];
      document.internalURL          = minioFile.path;
      document.internalExt          = minioFile.extension;
      document.internalSize         = uploadedFile.size;
      document.passedAVCheck        = true;
      document.internalMime         = uploadedFile.mimetype;
      document.internalOriginalName = documentDetails.originalName;
      document.displayName          = documentDetails.displayName;
      document.documentFileName     = documentDetails.fileName;
      document.dateUploaded         = documentDetails.dateUploaded ? documentDetails.dateUploaded : new Date();
      document.datePosted           = documentDetails.datePosted ? documentDetails.datePosted : new Date();
      document.documentAuthor       = documentDetails.documentAuthor;
      document.documentAuthorType   = documentDetails.documentAuthorType;
      document.documentSource       = documentDetails.documentSource;

      // Secure create attributes
      if (isPublic) {
        // public user can only create documents from comments
        document.documentSource = "COMMENT";
      } else {
        document.legislation          = parseInt(documentDetails.legislation);
        document.milestone            = documentDetails.milestone;
        document.type                 = documentDetails.type;
        document.description          = documentDetails.description;
        document.projectPhase         = documentDetails.projectPhase;
        document.eaoStatus            = documentDetails.eaoStatus;

        if ((documentDetails.eaoStatus && documentDetails.eaoStatus === 'Published') ||
                    (documentDetails.publish)) {
          document.read.push('public');
        }
      }

      return document.save()
        .then(function (createdDocument) {
          defaultLog.info("Created new document object:", createdDocument._id);
          Utils.recordAction('Post', 'Document', userName, createdDocument._id);
          return createdDocument;
        })
        .catch(function (error) {
          defaultLog.debug('Document creation failed: ', error);
          defaultLog.debug('Rolling back document from Minio');
          MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, document.project, document.internalURL);

          throw Error(error);
        });
    }
  } catch (error) {
    delete error['path'];
    throw Error(error);
  }
};

exports.fetchDocuments = async function(pageNumber, pageSize, sortBy, query, keywords, projects, comments, roles) {
  defaultLog.info('Fetching Documents');

  let documenttModel = mongoose.model('Document');
  let queryAggregates = [];

  // set aggregates
  // First, filter on schema type, and make sure we only return existing, undeleted records
  queryAggregates.push(
    {
      $match:
        {
          _schemaName: 'Document',
          $or:
            [
              { isDeleted: { $exists: false } },
              { isDeleted: false },
            ]
        }
    });

  // Next, we may have project ID's or Comment ID's that we're filtering on. Apply these as $in aggregates
  if (projects && projects.length > 0) {
    let objectIds = [];
    _.each(projects, function (projectId) {
      objectIds.push(mongoose.Types.ObjectId(projectId));
    });

    queryAggregates.$match['documentSource'] = 'PROJECT';
    queryAggregates.$match['projects'] = { $in: objectIds };
  }
  // Comments are completely ignored in current document endpoints
  // We need to come up with a query for fetching docs by comment
  // else if (comments && comments.length > 0)
  // {
  // queryAggregates.$match['documentSource'] = 'COMMENT';
  // }

  // Predicates (and, or filters by KVP, map from query object)

  // apply keyword filter
  if (keywords && keywords.length > 0) {
    queryAggregates.$match['$text'] =
        {
          $search: keywords,
          $caseSensitive: false
        };
  }

  // Misc.
  let collation =
    {
      locale: 'en',
      strength: 2
    };

  // document status

  queryAggregates.push(
    {
      $addFields: {
        "status": {
          $cond: {
            if: {
              // This way, if read isn't present, we assume public no roles array.
              $and: [
                { $cond: { if: "$read", then: true, else: false } },
                {
                  $anyElementTrue: {
                    $map: {
                      input: "$read",
                      as: "fieldTag",
                      in: { $setIsSubset: [["$$fieldTag"], ['public']] }
                    }
                  }
                }
              ]
            },
            then: 'published',
            else: 'unpublished'
          }
        }
      }
    });

  // if we're coming in from the public endpoint, and we're fetching documents,
  // we MUST add a match to enforce eaoStatus='Published', regardless of filter
  // ensure this occurs after the main filters

  if(roles && roles.length === 1 && roles.includes('public')) {
    queryAggregates.push({
      $match: { status: 'published' }
    });
  }
  // Sorting
  // loop through sortBy fields. a value of -1 = descending, 1 = ascending
  if(sortBy && sortBy.length > 1) {
    let $sort = {};

    let sortDirection = sortBy.charAt(0) == '-' ? -1 : 1;
    let sortField = sortBy.slice(1);

    $sort[sortField] = sortDirection;

    queryAggregates.push($sort);
  }

  // paging
  queryAggregates.push(
    {
      $facet:
        {
          searchResults:
            [
              { $skip: pageNumber * pageSize },
              { $limit: pageSize }
            ],
          meta:
            [ { $count: 'searchResultsTotal' } ]
        }
    });

  // execute the query aggregates
  let resultSet = await documenttModel.aggregate(queryAggregates)
    .collation(collation)
    .exec();

  // sanitize based on roles
  resultSet = Utils.filterData('Document', resultSet, roles);

  return resultSet;
};

exports.fetchDocument = async function(documentId, roles) {
  let result = await mongoose.model('Document').findById(mongoose.Types.ObjectId(documentId));

  // sanitize based on roles. Return the first result
  // as we will only ever have one.
  result = Utils.filterData('Document', [result], roles)[0];

  return result;
};

exports.updateDocument = async function(userName, originalDocument, projectId, uploadedFile, documentDetails) {
  defaultLog.info('Updating document:' + originalDocument._id);

  try {
    originalDocument._updatedBy         = userName;
    originalDocument.displayName        = documentDetails.displayName;
    originalDocument.milestone          = documentDetails.milestone;
    originalDocument.type               = documentDetails.type;
    originalDocument.documentAuthorType = documentDetails.documentAuthorType;
    originalDocument.projectPhase       = documentDetails.projectPhase;
    originalDocument.dateUploaded       = documentDetails.dateUploaded;
    originalDocument.datePosted         = documentDetails.datePosted;
    originalDocument.description        = documentDetails.description;
    originalDocument.keywords           = documentDetails.keywords;
    originalDocument.legislation        = parseInt(documentDetails.legislation);
    originalDocument.eaoStatus          = documentDetails.eaoStatus;

    if (documentDetails.eaoStatus === 'Published') {
      originalDocument.read = constants.SECURE_ROLES.concat(constants.PUBLIC_ROLES);
    } else if (documentDetails.eaoStatus === 'Rejected') {
      originalDocument.read = constants.SECURE_ROLES;
    }

    let updatedDocument = await originalDocument.save();

    if (updatedDocument) {
      Utils.recordAction('put', 'document', userName, originalDocument._id);
      defaultLog.debug('Document updated:', updatedDocument);

      return updatedDocument;
    } else {
      throw Error('Failed to update document.');
    }
  } catch (error) {
    throw Error(error);
  }
};

exports.deleteDocument = function(user, document) {
  return Actions.delete(document).then(function (deleted) {
    Utils.recordAction('Delete', 'Document', user, document._id);
    return deleted;
  },
  function (error) {
    throw Error('Failed to delete document: ', error);
  });
};

exports.publishDocument = async function(user, document) {
  document.eaoStatus = 'Published';
  let updatedDocument = await document.save();

  return Actions.publish(updatedDocument).then(function (publishedDocument) {
    Utils.recordAction('Publish', 'Document', user, publishedDocument._id);
    return publishedDocument;
  },
  function (error) {
    throw Error('Failed to publish document: ', error);
  });
};

exports.unPublishDocument = async function(user, document) {
  document.eaoStatus = 'Rejected';
  let updatedDocument = await document.save();

  return Actions.unPublish(updatedDocument).then(function (unPublishedDocument) {
    Utils.recordAction('UnPublish', 'Document', user, unPublishedDocument._id);
    return unPublishedDocument;
  },
  function (error) {
    throw Error('Failed to unpublish document: ', error);
  });
};

exports.featureDocument = async function (document, project) {
  let featuredDocumentsCount = await mongoose.model('Document').count({ project: project._id, isFeatured: true });

  if (featuredDocumentsCount < constants.MAX_FEATURE_DOCS) {
    document.isFeatured = true;
    document = await document.save();
  }

  return document;
};

exports.unfeatureDocument = async function (document) {
  document.isFeatured = false;
  document = await document.save();

  return document;
};

exports.downloadDocumentGetMeta = async function (roles, userName, document, fileNameOverride) {
  let fileName = fileNameOverride ? fileNameOverride : document.documentFileName;
  let fileType = document.internalExt;
  let fileMeta;

  if (fileName.slice(- fileType.length) !== fileType) {
    fileName = fileName + '.' + fileType;
  }

  // ? validate file name. Make sure it's not going to explode when it hits the user
  // ? Something like:
  // ^(?:[\w]\:|\\)(\\[a-z_\-\s0-9\.]+)+\.(txt|png|gif|jpg|jpeg|pdf|doc|docx|xls|xlsx)$

  return MinioController.statObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, document.internalURL)
    .then(function (objectMeta) {
      fileMeta = objectMeta;
      // get the download URL
      return MinioController.getPresignedGETUrl(MinioController.BUCKETS.DOCUMENTS_BUCKET, document.internalURL);
    },
    function () {
      throw Error('Document not found');
    })
    .then(function (documentURL) {
      let documentMeta =
                              {
                                fileName: fileName,
                                size: fileMeta && Object.prototype.hasOwnProperty.call(fileMeta, 'size') ? fileMeta.size : 0,
                                metaData: fileMeta && Object.prototype.hasOwnProperty.call(fileMeta, 'metaData') ? fileMeta.metaData : {},
                                url: documentURL
                              };

      return documentMeta;
    });
};