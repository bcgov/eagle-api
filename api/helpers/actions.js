"use strict";
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');

exports.publish = async function (o, isProject = false) {
    return new Promise(function (resolve, reject) {
      // Need project specific logic to handle legislation keys
        // Object wasn't already published?
        let newReadArray;
        if (isProject && !o[o.currentLegislationYear].read.includes('public')) {
          newReadArray = o[o.currentLegislationYear].read;
          newReadArray.push('public');
          o[o.currentLegislationYear].read = newReadArray;
          resolve(o.save());
        } else if (!o.read.includes('public')) {
          // Remove publish, save then return.
            newReadArray = o.read;
            newReadArray.push('public');
            o.read = newReadArray;
            resolve(o.save());
        } else {
          resolve(o);
        }
    });
};

exports.isPublished = async function (o) {
    return _.find(o.tags, function (item) {
        return _.isEqual(item, ['public']);
    });
};

exports.unPublish = async function (o, isProject = false) {
    return new Promise(function (resolve, reject) {
      // Need project specific logic to handle legislation keys
        // Object wasn't already published?
        let newReadArray;
        if (isProject && o[o.currentLegislationYear].read.includes('public')) {
          newReadArray = o[o.currentLegislationYear].read.filter(perms => perms !== 'public');
          o[o.currentLegislationYear].read = newReadArray;
          resolve(o.save());
        } else if (o.read.includes('public')) {
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
        _.remove(o.tags, function (item) {
            return _.isEqual(item, ['public']);
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
    res.writeHead(code, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(object));
};