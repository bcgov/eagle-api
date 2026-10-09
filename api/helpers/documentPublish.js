/**
 * Publish or unpublish one Document: status, read[], audit record and the DEMI mirror. Shared by
 * PUT document/{id}/publish|unpublish and the Update image cascade so both stay in step.
 */

'use strict';

const Actions = require('./actions');
const Utils = require('./utils');
const demiPush = require('./demiPush');

// A caller that answers only once DEMI has the change passes `pushes`; the push lands on it.
const collect = (push, pushes) => {
  if (Array.isArray(pushes)) {
    pushes.push(push);
  }
};

exports.publish = async (document, username, args = null, pushes = null) => {
  document.eaoStatus = 'Published';
  const published = await Actions.publish(await document.save());
  Utils.recordAction('Publish', 'Document', username, String(document._id), args, document.project);
  collect(demiPush.document(published), pushes);
  return published;
};

// The Update image cascade passes eaoStatus null: back to the state it was uploaded in.
exports.unPublish = async (document, username, args = null, eaoStatus = 'Rejected', pushes = null) => {
  document.eaoStatus = eaoStatus;
  const unPublished = await Actions.unPublish(await document.save());
  Utils.recordAction('Unpublish', 'Document', username, String(document._id), args, document.project);
  collect(demiPush.document(unPublished), pushes);
  return unPublished;
};
