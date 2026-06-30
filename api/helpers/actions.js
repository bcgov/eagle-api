'use strict';

exports.publish = async function (o,save=false) {
  return new Promise(function (resolve) {
    // Need project specific logic to handle legislation keys
    // Object wasn't already published?
    let newReadArray;
    if (!o.read.includes('public')) {
      // Remove publish, save then return.
      newReadArray = o.read;
      newReadArray.push('public');
      o.read = newReadArray;
      resolve(o.save());
    } else {
      resolve(save ? o.save(): o);
    }
  });
};

exports.isPublished = async function (o) {
  return o.tags.find(function (item) {
    return Array.isArray(item) && item.length === 1 && item[0] === 'public';
  });
};

exports.unPublish = async function (o) {
  return new Promise(function (resolve) {
    // Need project specific logic to handle legislation keys
    // Object wasn't already published?
    let newReadArray;
    if (o.read.includes('public')) {
      newReadArray = o.read.filter(perms => perms !== 'public');
      o.read = newReadArray;
      // Remove publish, save then return.
      resolve(o.save());
    } else {
      resolve(o);
    }
  });
};

exports.delete = function (o) {
  return new Promise(function (resolve, reject) {
    o.tags = o.tags.filter(function (item) {
      return !(Array.isArray(item) && item.length === 1 && item[0] === 'public');
    });
    o.isDeleted = true;
    o.markModified('tags');
    o.markModified('isDeleted');
    // save then return.
    o.save().then(resolve, function (err) {
      reject({ code: 400, message: err.message });
    });
  });
};

exports.sendResponse = function (res, code, object) {
  return res.status(code).json(object);
};