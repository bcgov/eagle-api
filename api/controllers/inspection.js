var defaultLog = require('winston').loggers.get('default');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var MinioController = require('../helpers/minio');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedElementItemGet = function (args, res) {
  var self = this;
  self.scopes = args.swagger.params.auth_payload.realm_access.roles;

  self.thumbnail = args.swagger.params.thumbnail && args.swagger.params.thumbnail.value === 'true' ? true : false;
  if (args.swagger.params.filename && args.swagger.params.filename.value) {
    self.filename = args.swagger.params.filename.value;
  }
  defaultLog.debug('protectedElementItemGet thumbnail=%s filename=%s', self.thumbnail, self.filename);

  defaultLog.info('args.swagger.params:', args.swagger.params.auth_payload.realm_access.roles);

  // Build match query if on elemId route
  var query = {};
  if (args.swagger.params.itemId && args.swagger.params.itemId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.itemId.value, query);
  }
  // Set query type
  Object.assign(query, { '_schemaName': 'InspectionItem' });

  defaultLog.debug('protectedElementItemGet query: %j', query);

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
              defaultLog.debug('Streaming full inspection item file');
              return Utils.getUrlAsStream(docURL)
                .then(stream => stream.pipe(res));
            } else {
              // Setup a downloader function.
              const download = url => Utils.getUrlAsStream(url);
              // Download the file and pipe the generated thumbnail to it, streaming to the client.
              // TODO: Doesn't take into account orientation.
              return download(docURL)
                .then(response => response.pipe(transform({
                  height: parseInt(100, 10),
                  // quality: q && parseInt(q, 10),
                  width: parseInt(100, 10),
                })).pipe(res))
                .catch(err => {
                  defaultLog.error('Error streaming inspection item thumbnail:', err);
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
