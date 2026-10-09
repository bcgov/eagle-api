'use strict';

const defaultLog = require('winston').loggers.get('default');
const demiPush = require('./demiPush');

exports.publish = async function (o, save = false) {
  let isModified = false;
  if (o.schema && o.schema.paths && o.schema.paths.isPublished) {
    if (o.isPublished !== true) {
      o.isPublished = true;
      isModified = true;
    }
  }
  if (!o.read.includes('public')) {
    o.read.push('public');
    isModified = true;
  }
  if (isModified || save) {
    return o.save();
  }
  return o;
};

exports.isPublished = async function (o) {
  return o.tags.find(function (item) {
    return Array.isArray(item) && item.length === 1 && item[0] === 'public';
  });
};

exports.unPublish = async function (o) {
  let isModified = false;
  if (o.schema && o.schema.paths && o.schema.paths.isPublished) {
    if (o.isPublished !== false) {
      o.isPublished = false;
      isModified = true;
    }
  }
  if (o.read.includes('public')) {
    o.read = o.read.filter(perms => perms !== 'public');
    isModified = true;
  }
  if (isModified) {
    return o.save();
  }
  return o;
};

exports.delete = async function (o) {
  // No model declares tags or isDeleted, so a plain assignment is dropped by strict mode.
  const tags = o.get('tags');
  if (Array.isArray(tags)) {
    o.set('tags', tags.filter(function (item) {
      return !(Array.isArray(item) && item.length === 1 && item[0] === 'public');
    }), { strict: false });
  }
  o.set('isDeleted', true, { strict: false });
  try {
    return await o.save();
  } catch (err) {
    throw { code: 400, message: err.message };
  }
};

exports.sendResponse = function (res, code, object) {
  return res.status(code).json(object);
};

// Body for a write that saved in Mongo but whose DEMI push did not land.
exports.NOT_MIRRORED = {
  saved: true,
  mirrored: false,
  message: 'Saved, but the record could not be mirrored to DEMI; retry or run a re-push.'
};

const UNKNOWN = { kind: 'unknown', id: 'unknown' };

/**
 * Waits for the write's DEMI push(es), then answers `code` with `data`, or 502 NOT_MIRRORED with one
 * error line per failed push. Never rejects: the Mongo write already stands.
 */
exports.sendMirrored = async function (res, code, data, pushes) {
  let result;
  try {
    result = await demiPush.awaitMirror(pushes);
  } catch (err) {
    result = { mirrored: false, failures: [{ ...UNKNOWN, reason: `failed: ${err && err.message}` }] };
  }
  try {
    if (result.mirrored) {
      return exports.sendResponse(res, code, data);
    }
    for (const { kind, id, reason } of result.failures) {
      defaultLog.error(`[demiPush] not-mirrored ${kind} ${id}: ${reason}`, { kind, id, reason });
    }
    return exports.sendResponse(res, 502, exports.NOT_MIRRORED);
  } catch (err) {
    defaultLog.error(`[demiPush] could not send reply: ${err && err.message}`);
    // A body that fails to serialize throws before anything is written; answer once so the request does not hang.
    if (!res.headersSent) {
      try {
        exports.sendResponse(res, 500, { message: 'Could not send the reply.' });
      } catch (sendErr) {
        defaultLog.error(`[demiPush] could not send the 500 either: ${sendErr && sendErr.message}`);
      }
    }
  }
};
