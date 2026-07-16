'use strict';

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
  o.tags = o.tags.filter(function (item) {
    return !(Array.isArray(item) && item.length === 1 && item[0] === 'public');
  });
  o.isDeleted = true;
  o.markModified('tags');
  o.markModified('isDeleted');
  try {
    return await o.save();
  } catch (err) {
    throw { code: 400, message: err.message };
  }
};

exports.sendResponse = function (res, code, object) {
  return res.status(code).json(object);
};