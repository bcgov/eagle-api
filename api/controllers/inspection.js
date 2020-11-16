var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var mime = require('mime-types');
var uploadDir = process.env.UPLOAD_DIRECTORY || './uploads/';
var MinioController = require('../helpers/minio');
var rp = require('request-promise-native');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

//  Create a new inspection
exports.protectedPostInspection = async function (args, res) {
  var obj = args.swagger.params.inspection.value;

  defaultLog.info('Incoming new object:', obj);

  var Inspection = mongoose.model('Inspection');

  var inspection = new Inspection(obj);

  inspection.startDate = obj.startDate;
  inspection.endDate = obj.endDate;

  if (obj.project) {
    inspection.project = mongoose.Types.ObjectId(obj.project);
  } else {
    inspection.customInspectionName = obj.customInspectionName;
  }
  // Define security tag defaults
  inspection.read = ['sysadmin', 'inspector'];
  inspection.write = ['sysadmin', 'inspector'];
  inspection.delete = ['sysadmin', 'inspector'];
  inspection._createdBy = args.swagger.params.auth_payload.preferred_username;
  inspection._createdDate = Date.now();

  // This is an overwrite in case of error from mobile app,
  // otherwise this will create a new record.
  try {
    let elementDocument = await Inspection.findOne({_schemaName: 'Inspection', inspectionId: inspection.inspectionId});
    if (elementDocument) {
      // We alrady had this - send it back to them.
      return Actions.sendResponse(res, 200, elementDocument);
    } else {
      inspection.save()
        .then(function (doc) {
          Utils.recordAction('Post', 'Inspection', args.swagger.params.auth_payload.preferred_username, doc._id);
          doc.status = 'Uploading';
          return Actions.sendResponse(res, 200, doc);
        })
        .catch(function (err) {
          console.log('Error in API:', err);
          return Actions.sendResponse(res, 400, err);
        });
    }
  } catch (err) {
    console.log('Error in API:', err);
    return Actions.sendResponse(res, 400, err);
  }
};

//  Create a new inspection element
exports.protectedPostElement = async function (args, res) {
  var obj = args.swagger.params.inspection.value;
  var inspId = args.swagger.params.inspId.value;

  defaultLog.info('Incoming new object:', obj);

  var InspectionElement = mongoose.model('InspectionElement');

  var inspectionElement = new InspectionElement(obj);

  // Define security tag defaults
  inspectionElement.read = ['sysadmin', 'inspector'];
  inspectionElement.write = ['sysadmin', 'inspector'];
  inspectionElement.delete = ['sysadmin', 'inspector'];
  inspectionElement._createdBy = args.swagger.params.auth_payload.preferred_username;
  inspectionElement._createdDate = Date.now();

  // If this exists already, don't bother to insert.. just return 200 OK
  // Based on elementId (as per mobile uuid);  We don't want to modify it in case there
  // are other elements that exist in the elements array
  var Inspection = mongoose.model('Inspection');
  let elementDocument = await Inspection.findOne({_schemaName: 'InspectionElement', elementId: inspectionElement.elementId});
  if (elementDocument) {
    // We alrady had this - send it back to them.
    return Actions.sendResponse(res, 200, elementDocument);
  } else {
    // Couldn't find that id, let it pass through.
    let theDoc = null;
    inspectionElement.save()
      .then(function (doc) {
        theDoc = doc;
        var Inspection = mongoose.model('Inspection');
        return Inspection.update(
          { _id: mongoose.Types.ObjectId(inspId) },
          {
            $push: {
              elements: doc._id
            }
          },
          { new: true }
        );
      })
      .then(function () {
        Utils.recordAction('Post', 'InspectionElement', args.swagger.params.auth_payload.preferred_username, theDoc._id);
        return Actions.sendResponse(res, 200, theDoc);
      })
      .catch(function (err) {
        console.log('Error in API:', err);
        return Actions.sendResponse(res, 400, err);
      });
  }
};

// Create element item
exports.protectedPostElementItem = async function (args, res) {
  var upfile = args.swagger.params.upfile.value;
  var guid = args.swagger.params.itemId.value;
  var project = null;
  if (args.swagger.params.project.value) {
    project = args.swagger.params.project.value;
  }
  var elementId = args.swagger.params.elementId.value;
  var type = args.swagger.params.type.value;
  var timestamp = args.swagger.params.timestamp.value;
  var caption = args.swagger.params.caption.value;
  var text = args.swagger.params.text.value;
  var geo = args.swagger.params.geo.value;

  var ext, tempFilePath = null;
  if (upfile) {
    ext = mime.extension(args.swagger.params.upfile.value.mimetype);
    tempFilePath = uploadDir + guid + '.' + ext;

    var fs = require('fs');
    fs.writeFileSync(tempFilePath, args.swagger.params.upfile.value.buffer);
    console.log('wrote file successfully.', tempFilePath);

    console.log(MinioController.BUCKETS.DOCUMENTS_BUCKET,
      project,
      upfile.originalname,
      tempFilePath);

    MinioController.putDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET,
      project,
      upfile.originalname,
      tempFilePath)
      .then(async function (minioFile) {
        console.log('putDocument:', minioFile);

        // remove file from temp folder
        fs.unlinkSync(tempFilePath);

        console.log('unlink');

        var InspectionItem = mongoose.model('InspectionItem');
        var doc = new InspectionItem();

        // Set the mobile itemId
        doc.itemId = guid;

        // Define security tag defaults
        if (project) {
          doc.project = mongoose.Types.ObjectId(project);
        }
        doc._addedBy = args.swagger.params.auth_payload.preferred_username;
        doc._createdDate = new Date();
        doc.read = ['sysadmin', 'inspector'];
        doc.write = ['sysadmin', 'inspector'];
        doc.delete = ['sysadmin', 'inspector'];

        doc.type = type;
        doc.caption = caption;
        doc.timestamp = timestamp;
        doc.geo = JSON.parse(geo);

        doc.internalURL = minioFile.path;
        doc.internalExt = minioFile.extension;
        doc.internalSize = upfile.size;
        doc.internalMime = upfile.mimetype;

        let itemDocument = await InspectionItem.findOne({_schemaName: 'InspectionItem', itemId: doc.itemId});
        if (itemDocument) {
          // We already had this - send it back to them.
          return Actions.sendResponse(res, 200, itemDocument);
        } else {
          var savedDocument = null;
          doc.save()
            .then(function (d) {
              defaultLog.info('Saved new document object:', d._id);
              Utils.recordAction('Post', 'InspectionItem', args.swagger.params.auth_payload.preferred_username, d._id);
              savedDocument = d;
              return;
            }).then(function () {
              // Push this into the inspection elements' items' array for things.
              var InspectionElement = mongoose.model('InspectionElement');
              return InspectionElement.update(
                { _id: mongoose.Types.ObjectId(elementId) },
                {
                  $push: {
                    items: doc
                  }
                },
                { new: true }
              );
            }).then(function (theInspection) {
              console.log('updated insp:', theInspection);
              return theInspection;
            }).then(function () {
              return Actions.sendResponse(res, 200, savedDocument);
            })
            .catch(function (error) {
              console.log('error:', error);
              // the model failed to be created - delete the document from minio so the database and minio remain in sync.
              MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
              return Actions.sendResponse(res, 400, error);
            });
        }
      });
  } else {
    // Just a text element.
    var InspectionItem = mongoose.model('InspectionItem');
    var doc = new InspectionItem();

    doc.itemId = guid;

    // Define security tag defaults
    if (project) {
      doc.project = mongoose.Types.ObjectId(project);
    }
    doc._addedBy = args.swagger.params.auth_payload.preferred_username;
    doc._createdDate = new Date();
    doc.read = ['sysadmin', 'inspector'];
    doc.write = ['sysadmin', 'inspector'];
    doc.delete = ['sysadmin', 'inspector'];

    doc.text = JSON.parse(text);
    doc.markModified('text');
    doc.type = type;
    doc.geo = JSON.parse(geo);
    doc.markModified('geo');

    let itemDocument = await InspectionItem.findOne({_schemaName: 'InspectionItem', itemId: doc.itemId});
    if (itemDocument) {
      // We alrady had this - send it back to them.
      return Actions.sendResponse(res, 200, itemDocument);
    } else {
      var savedDocument = null;
      doc.save()
        .then(function (d) {
          defaultLog.info('Saved new document object:', d._id);
          Utils.recordAction('Post', 'InspectionItem', args.swagger.params.auth_payload.preferred_username, d._id);
          savedDocument = d;
          return;
        }).then(function () {
          // Push this into the inspection elements' array for things.
          var InspectionElement = mongoose.model('InspectionElement');
          return InspectionElement.update(
            { _id: mongoose.Types.ObjectId(elementId) },
            {
              $push: {
                items: doc
              }
            },
            { new: true }
          );
        }).then(function (theInspection) {
          console.log('updated insp:', theInspection);
          return theInspection;
        }).then(function () {
          return Actions.sendResponse(res, 200, savedDocument);
        })
        .catch(function (error) {
          console.log('error:', error);
          // the model failed to be created - delete the document from minio so the database and minio remain in sync.
          MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
          return Actions.sendResponse(res, 400, error);
        });
    }
  }
};

exports.protectedElementItemGet = function (args, res) {
  var self = this;
  self.scopes = args.swagger.params.auth_payload.realm_access.roles;

  self.thumbnail = args.swagger.params.thumbnail && args.swagger.params.thumbnail.value === 'true' ? true : false;
  if (args.swagger.params.filename && args.swagger.params.filename.value) {
    self.filename = args.swagger.params.filename.value;
  }
  console.log('self.thumbnail:', self.thumbnail);
  console.log('self.filename:', self.filename);

  defaultLog.info('args.swagger.params:', args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on elemId route
  var query = {};
  if (args.swagger.params.itemId && args.swagger.params.itemId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.itemId.value, query);
  }
  // Set query type
  _.assignIn(query, { '_schemaName': 'InspectionItem' });

  console.log('QE:', query);

  Utils.runDataQuery('InspectionItem',
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

        var fileMeta;

        // check if the file exists in Minio
        return MinioController.statObject(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL)
          .then(function (objectMeta) {
            if (!objectMeta) {
              // ObjectMeta was null, drop through all the chains below.
              return null;
            }
            fileMeta = objectMeta;
            // get the download URL
            return MinioController.getPresignedGETUrl(MinioController.BUCKETS.DOCUMENTS_BUCKET, blob.internalURL);
          }, function () {
            return Actions.sendResponse(res, 404, {});
          })
          .then(function (docURL) {
            if (!docURL) {
              // ObjectMeta was null
              return Actions.sendResponse(res, 404, {});
            }
            Utils.recordAction('Download', 'InspectionItem', args.swagger.params.auth_payload.preferred_username, args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
            // stream file from Minio to client
            // res.setHeader('Content-Length', fileMeta.size);
            res.setHeader('Content-Type', fileMeta.metaData['content-type']);
            res.setHeader('Content-Disposition', 'attachment;filename="' + self.filename + '"');

            if (!self.thumbnail) {
              console.log('Getting full');
              return rp(docURL).pipe(res);
            } else {
              var axios = require('axios');
              // Setup a downloader function.
              const download = url => axios({
                method: 'get',
                url,
                responseType: 'stream',
              }).then(response => response.data);
              // Download the file and pipe the generated thumbnail to it, streaming to the client.
              // TODO: Doesn't take into account orientation.
              return download(docURL)
                .then(response => response.pipe(transform({
                  height: parseInt(100, 10),
                  // quality: q && parseInt(q, 10),
                  width: parseInt(100, 10),
                })).pipe(res))
                .catch(err => {
                  console.log('ERR:', err);
                  res.status(404).send();
                });
            }
          });
      } else {
        return Actions.sendResponse(res, 404, {});
      }
    });
};

const isNumeric = n => !isNaN(parseFloat(n)) && isFinite(n);

const transform = ({
  blur,
  cropMode,
  height,
  width,
  quality,
}) => {
  var sharp = require('sharp');
  const sharpObj = sharp();
  // Width and height set...
  if (Number.isInteger(height) && Number.isInteger(width)) {
    sharpObj.resize(width, height);

    // Only width set...
  } else if (isNumeric(width)) {
    sharpObj.resize(width);

    // Only height set...
  } else if (isNumeric(height)) {
    sharpObj.resize(null, height);
  }

  // Blur
  if (isNumeric(blur)) {
    // Clamp between 0.3 and 1000
    sharpObj.blur(Math.min(1000, Math.max(blur, 0.3)));
  }

  // Crop mode
  if (sharp.gravity[cropMode]) {
    sharpObj.crop(sharp.gravity[cropMode]);
  } else if (sharp.strategy[cropMode]) {
    sharpObj.crop(sharp.strategy[cropMode]);
  }

  // JPEG quality
  sharpObj.jpeg({
    quality: isNumeric(quality) ? Math.max(1, Math.min(100, quality)) : 80,
  });
  return sharpObj;
};
