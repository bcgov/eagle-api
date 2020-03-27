'use strict';
const Promise = require('bluebird');
Promise.config({
  warnings: false,
  longStackTraces: true,
  cancellation: false,
  monitoring: false,
  asyncHooks: false,
});
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const glob = require("glob");
const listFileMatchPattern = require('../factories/list_factory').listFileMatchPattern;
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

const allFileMatchPattern = "./migrations_data/lists/*";

describe('Catch Poorly Written List Migration Data', () => {
  describe('Check Migrations Data Lists', () => {

    test('Check each list only has one array', done => {
      glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + listFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          let filePath = files[i].replace(/^\.\//g, '../../../');
          let fileObject = require(filePath);

          expect(Array).toEqual(fileObject.constructor);

          fs.readFile(files[i], 'utf8', function (err, data) {
            if (err) throw err;
            let module_exports_occurrences = (data.match(/module\.exports/g) || []).length;
            expect(1).toEqual(module_exports_occurrences);
          });
        }
        done();
      });
    }, 50000);

    test('Check only javascript files are in the migrations_data/lists folder', done => {
      glob(allFileMatchPattern, function(err, files) {
        if (err) {
          defaultLog.error('cannot match pattern \'' + allFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          expect(true).toEqual(files[i].endsWith('.js') || files[i].endsWith('.md'));
        }
        done();
      });
    }, 50000);

    test('Check each file in the migrations_data/lists folder starts with a valid \'YYYYMMDDHHmmss-\' string', done => {
      glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + listFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          let fileName = files[i].replace('./migrations_data/lists/','');
          expect(true).toEqual(fileName.startsWith('20'));
          expect(true).toEqual(fileName.startsWith('-', 14));
          let isValidDate = moment(fileName.substr(0, 14), 'YYYYMMDDHHmmss', true).isValid();
          defaultLog.debug(fileName.substr(0, 14), 'is a valid date?', isValidDate);
          expect(true).toEqual(isValidDate);
        }
        done();
      });
    }, 50000);

    test('Check each file in the migrations_data/lists folder has the word \'new\' or \'update\' after the date', done => {
      // if you're deleting, be smart about how you do it and update /api/test/factories/list_factory.js::isSpecialCaseToIgnore() so that generators create valid list data
      glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + listFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          let fileName = files[i].replace('./migrations_data/lists/','');
          expect(true).toEqual(fileName.startsWith('new', 15) || fileName.startsWith('update', 15));
        }
        done();
      });
    }, 50000);

    test('Check that the name of the migrations_data/lists file is meaningful showing what type of list data it contains', done => {
      // To provide the ability to quickly glean meaningful info from the file names.  Calling a file 'lists.js' provides zero value.
      glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + listFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          let fileName = files[i].replace('./migrations_data/lists/','');
          let fileNameMinusDotJs = fileName.slice(0, fileName.length - 3);
          let fileNameMinusDate = fileNameMinusDotJs.slice(15, fileNameMinusDotJs.length);
          let typePartOfFileName = fileNameMinusDate.replace(/^new-/, '');
          if (fileNameMinusDate == typePartOfFileName) typePartOfFileName = fileNameMinusDate.replace(/^update-/, '');
          // make sure types are separated by underscores and end with 's'
          defaultLog.debug(typePartOfFileName);
          let typesInFileName = typePartOfFileName.split('_');
          if (0 == typesInFileName.length) {
            expect('s').toEqual(typePartOfFileName.slice(typePartOfFileName.length - 1, typePartOfFileName.length));
            continue;
          }
          for (let j=0; j<typesInFileName.length; j++) {
            let typeInFileName = typesInFileName[j];
            defaultLog.debug(typeInFileName);
            expect('s').toEqual(typeInFileName.slice(typeInFileName.length - 1, typeInFileName.length));
          }
        }
        done();
      });
    }, 50000);

    test('Check that the name of the migrations_data/lists file is meaningful showing what type of list data it contains', done => {
      // To provide the ability to quickly glean meaningful info from the file names.  Calling a file 'lists.js' provides zero value.
      glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + listFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          let filePath = files[i].replace(/^\.\//g, '../../../');
          let fileObject = require(filePath);

          const lognerListTypes = [...new Set(fileObject.map(listItem => listItem.type))].sort().filter(type => (4 < type.length));
          const abbreviatedListTypes = lognerListTypes.map(fullLengthType => fullLengthType.slice(0, 3));

          let fileName = files[i].replace('./migrations_data/lists/','');
          let fileNameMinusDotJs = fileName.slice(0, fileName.length - 3);
          let fileNameMinusDate = fileNameMinusDotJs.slice(15, fileNameMinusDotJs.length);
          let typePartOfFileName = fileNameMinusDate.replace(/^new-/, '');
          if (fileNameMinusDate == typePartOfFileName) typePartOfFileName = fileNameMinusDate.replace(/^update-/, '');
          // test first chars only to avoid differences due to plural spellings
          // only do the first three or less of any listTypes longer than 5 chars for sanity
          defaultLog.debug(typePartOfFileName);
          if (0 == abbreviatedListTypes.length) {
            expect(1).toEqual(1);
            continue;
          }
          for (let j=0; j<((3 > abbreviatedListTypes.length) ? abbreviatedListTypes.length : 3); j++) {
            let listType = abbreviatedListTypes[j];
            defaultLog.debug(abbreviatedListTypes);
            expect(true).toEqual(typePartOfFileName.includes(listType));
          }
        }
        done();
      });
    }, 50000);
  });
});
