var auth = require("../helpers/auth");
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var qs = require('qs');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var mime = require('mime-types');
var FlakeIdGen = require('flake-idgen'),
  intformat = require('biguint-format'),
  generator = new FlakeIdGen;
var uploadDir = process.env.UPLOAD_DIRECTORY || "./uploads/";
var MinioController = require('../helpers/minio');
var rp = require('request-promise-native');

var tagList = [
  'name',
  'project',
  'startDate',
  'endDate',
  'email',
  'label',
  'case'
];

var getSanitizedFields = function (fields) {
  return _.remove(fields, function (f) {
    return (_.indexOf(tagList, f) !== -1);
  });
}

exports.protectedOptions = function (args, res, rest) {
  res.status(200).send();
}

//  Create a new inspection
exports.protectedPost = function (args, res, next) {
  var obj = args.swagger.params.inspection.value;

  defaultLog.info("Incoming new object:", obj);

  var Inspection = mongoose.model('Inspection');

  var inspection = new Inspection(obj);
  inspection.proponent = mongoose.Types.ObjectId(obj.proponent)
  // Define security tag defaults
  inspection.read = ['sysadmin', 'staff'];
  inspection.write = ['sysadmin', 'staff'];
  inspection.delete = ['sysadmin', 'staff'];
  inspection._createdBy = args.swagger.params.auth_payload.preferred_username;
  inspection.createdDate = Date.now();
  inspection.save()
    .then(function (theInspection) {
      Utils.recordAction('Post', 'Inspection', args.swagger.params.auth_payload.preferred_username, theInspection._id);
      theInspection.status = 'Uploading';
      return Actions.sendResponse(res, 200, theInspection);
    })
    .catch(function (err) {
      console.log("Error in API:", err);
      return Actions.sendResponse(res, 400, err);
    });
};

exports.protectedPostElement = function (args, res, next) {
  var upfile = args.swagger.params.upfile.value;
  var guid = intformat(generator.next(), 'dec');
  var project = args.swagger.params.projId.value;
  var inspId = args.swagger.params.inspId.value;
  var type = args.swagger.params.type.value;
  var text = args.swagger.params.text.value;
  var geo = args.swagger.params.geo.value;

  var ext, tempFilePath = null;
  if (upfile) {
    ext = mime.extension(args.swagger.params.upfile.value.mimetype);
    tempFilePath = uploadDir + guid + "." + ext;

    var fs = require('fs');
    fs.writeFileSync(tempFilePath, args.swagger.params.upfile.value.buffer);
    console.log('wrote file successfully.');

    console.log(MinioController.BUCKETS.DOCUMENTS_BUCKET,
      mongoose.Types.ObjectId(project),
      upfile.originalname,
      tempFilePath)

    MinioController.putDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET,
      project,
      upfile.originalname,
      tempFilePath)
      .then(async function (minioFile) {
        console.log("putDocument:", minioFile);

        // remove file from temp folder
        fs.unlinkSync(tempFilePath);

        console.log('unlink');

        var InspectionElement = mongoose.model('InspectionElement');
        var doc = new InspectionElement();
        // Define security tag defaults
        doc.project = mongoose.Types.ObjectId(project);
        doc._addedBy = args.swagger.params.auth_payload.preferred_username;
        doc._createdDate = new Date();
        doc.read = ['sysadmin', 'staff'];
        doc.write = ['sysadmin', 'staff'];
        doc.delete = ['sysadmin', 'staff'];

        doc.type = type;
        doc.geo = JSON.parse(geo);

        doc.internalURL = minioFile.path;
        doc.internalExt = minioFile.extension;
        doc.internalSize = upfile.size;
        doc.internalMime = upfile.mimetype;

        // Update who did this?
        console.log('unlink');
        var savedDocument = null;
        doc.save()
          .then(function (d) {
            defaultLog.info("Saved new document object:", d._id);
            Utils.recordAction('Post', 'InspectionElement', args.swagger.params.auth_payload.preferred_username, d._id);
            savedDocument = d;
            return;
          }).then(function () {
            // Push this into the inspection elements' array for things.
            var Inspection = mongoose.model('Inspection');
            return Inspection.update(
              { _id: mongoose.Types.ObjectId(inspId) },
              {
                $push: {
                  elements: doc
                }
              },
              { new: true }
            );
          }).then(function (theInspection) {
            console.log("updated insp:", theInspection);
            return theInspection;
          }).then(function () {
            return Actions.sendResponse(res, 200, savedDocument);
          })
          .catch(function (error) {
            console.log("error:", error);
            // the model failed to be created - delete the document from minio so the database and minio remain in sync.
            MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
            return Actions.sendResponse(res, 400, error);
          });
      })
    } else {
      // Just a text element.
      var InspectionElement = mongoose.model('InspectionElement');
      var doc = new InspectionElement();
      // Define security tag defaults
      doc.project = mongoose.Types.ObjectId(project);
      doc._addedBy = args.swagger.params.auth_payload.preferred_username;
      doc._createdDate = new Date();
      doc.read = ['sysadmin', 'staff'];
      doc.write = ['sysadmin', 'staff'];
      doc.delete = ['sysadmin', 'staff'];

      doc.text = JSON.parse(text);
      doc.markModified('text');
      doc.type = type;
      doc.geo = JSON.parse(geo);
      doc.markModified('geo');

      var savedDocument = null;
      doc.save()
      .then(function (d) {
        defaultLog.info("Saved new document object:", d._id);
        Utils.recordAction('Post', 'InspectionElement', args.swagger.params.auth_payload.preferred_username, d._id);
        savedDocument = d;
        return;
      }).then(function () {
        // Push this into the inspection elements' array for things.
        var Inspection = mongoose.model('Inspection');
        return Inspection.update(
          { _id: mongoose.Types.ObjectId(inspId) },
          {
            $push: {
              elements: doc
            }
          },
          { new: true }
        );
      }).then(function (theInspection) {
        console.log("updated insp:", theInspection);
        return theInspection;
      }).then(function () {
        return Actions.sendResponse(res, 200, savedDocument);
      })
      .catch(function (error) {
        console.log("error:", error);
        // the model failed to be created - delete the document from minio so the database and minio remain in sync.
        MinioController.deleteDocument(MinioController.BUCKETS.DOCUMENTS_BUCKET, doc.project, doc.internalURL);
        return Actions.sendResponse(res, 400, error);
      });
    }
}

exports.protectedElementGet = function(args, res, next) {
  var self = this;
  self.scopes = args.swagger.params.auth_payload.realm_access.roles;

  self.thumbnail = args.swagger.params.thumbnail && args.swagger.params.thumbnail.value === 'true'  ? true : false
  if (args.swagger.params.filename && args.swagger.params.filename.value) {
    self.filename = args.swagger.params.filename.value;
  }
  console.log("self.thumbnail:", self.thumbnail);
  console.log("self.filename:", self.filename);

  defaultLog.info("args.swagger.params:", args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on elemId route
  var query = {};
  if (args.swagger.params.elemId && args.swagger.params.elemId.value) {
    query = Utils.buildQuery("_id", args.swagger.params.elemId.value, query);
  }
  // Set query type
  _.assignIn(query, { "_schemaName": "InspectionElement" });

  console.log("QE:", query);

  Utils.runDataQuery('InspectionElement',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    ["internalURL", "documentFileName", "internalMime", 'internalExt'], // Fields
    null, // sort warmup
    null, // sort
    null, // skip
    null, // limit
    false) // count
    .then(function (data) {
      if (data && data.length === 1) {
        var blob = data[0];

        var fileMeta;

        var fs = require('fs');

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
            Utils.recordAction('Download', 'InspectionElement', args.swagger.params.auth_payload.preferred_username, args.swagger.params.docId && args.swagger.params.docId.value ? args.swagger.params.docId.value : null);
            // stream file from Minio to client
            // res.setHeader('Content-Length', fileMeta.size);
            res.setHeader('Content-Type', fileMeta.metaData['content-type']);
            res.setHeader('Content-Disposition', 'attachment;filename="' + self.filename + '"');

            if (!self.thumbnail) {
              console.log("Getting full");
              return rp(docURL).pipe(res);
            } else {
              var axios = require('axios')
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
                console.log("ERR:", err);
                res.status(404).send();
              });
            };
          });
      } else {
        return Actions.sendResponse(res, 404, {});
      }
    });
}

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
  } else if (isNumeric(height)){
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
}
