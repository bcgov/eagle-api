/**
 * Publish or unpublish one Document: status, read[], audit record and the DEMI mirror. Shared by
 * PUT document/{id}/publish|unpublish and the Update image cascade so both stay in step.
 */

'use strict';

const Actions = require('./actions');
const Utils = require('./utils');
const demiPush = require('./demiPush');

exports.publish = async (document, username, args = null) => {
  document.eaoStatus = 'Published';
  const published = await Actions.publish(await document.save());
  Utils.recordAction('Publish', 'Document', username, String(document._id), args, document.project);
  demiPush.document(published);
  return published;
};

// The Update image cascade passes eaoStatus null: back to the state it was uploaded in.
exports.unPublish = async (document, username, args = null, eaoStatus = 'Rejected') => {
  document.eaoStatus = eaoStatus;
  const unPublished = await Actions.unPublish(await document.save());
  Utils.recordAction('Unpublish', 'Document', username, String(document._id), args, document.project);
  demiPush.document(unPublished);
  return unPublished;
};
