'use strict';

const defaultLog = require('winston').loggers.get('default');
const demiPush = require('./demiPush');
const { withoutPending } = require('./demiPushKinds');

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

// Every reply goes out here, so this is where rows lose the pending fields: they are the sweep's, never a client's.
exports.sendResponse = function (res, code, object) {
  return res.status(code).json(withoutPending(object));
};

const UNKNOWN = { kind: 'unknown', id: 'unknown' };

// The saved record, plus `mirrored` when a push was attempted. An array or a scalar has no room for it
// and goes as is. sendResponse drops the pending fields, which may predate this push.
function replyBody(data, mirrored) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || mirrored === undefined) {
    return data;
  }
  const body = typeof data.toJSON === 'function' ? data.toJSON() : Object.assign({}, data);
  return Object.assign(body, { mirrored });
}

/**
 * Waits for the write's DEMI push(es) and answers `code` with `data`, plus `mirrored` whenever a push
 * was attempted. A push that did not land flags its row for demi-push-sweep; the Mongo write stands
 * either way, so a client never retries a write that saved. Never rejects.
 */
exports.sendMirrored = async function (res, code, data, pushes) {
  let result;
  try {
    result = await demiPush.awaitMirror(pushes);
  } catch (err) {
    result = { mirrored: false, landed: [], failures: [{ ...UNKNOWN, reason: `failed: ${err && err.message}` }] };
  }
  await demiPush.recordOutcome(result);
  const attempted = !result.mirrored || result.landed.length > 0;
  try {
    if (result.mirrored) {
      for (const { kind, id } of result.landed) {
        defaultLog.info(`[demiPush] mirrored ${kind} ${id}`, { kind, id });
      }
    }
    return exports.sendResponse(res, code, replyBody(data, attempted ? result.mirrored : undefined));
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
