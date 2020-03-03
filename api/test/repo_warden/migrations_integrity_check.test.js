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
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;

const migrationsFileMatchPattern = "./migrations/*.js";
const allFileMatchPattern = "./migrations/*";

describe('Catch Poorly Written Migrations', () => {
  describe('Check Migrations', () => {

    test('Check only javascript files are in the migrations folder', done => {
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

    test('Check each file in the migrations folder starts with a valid \'YYYYMMDDHHmmss-\' string', done => {
      glob(migrationsFileMatchPattern, function(err, files) { // lists/**/*.js
        if (err) {
          defaultLog.error('cannot match pattern \'' + migrationsFileMatchPattern + '\'', err);
          return;
        }
        if (!((!!files) && (Array === files.constructor))) {
          defaultLog.error('object \'files\' is not an array');
          return;
        }
        for (let i=0; i<files.length; i++) {
          if (files[i].endsWith('.md')) continue;
          let fileName = files[i].replace('./migrations/','');
          expect(true).toEqual(fileName.startsWith('20'));
          expect(true).toEqual(fileName.startsWith('-', 14));
          let datePortionOfFileName = fileName.substr(0, 14);
          
          // DO NOT ADD any more to this list.  Migrations have a date prefix, use valid dates from now on.
          // We're not going to go unsnarl our prod database so we will leave these exeptions as is.
          // And if you're worried about migration clobber, talk to your teammates and coordinate with real times!
          const specialBadLegacyCases = ['20200116825964', '20200106657647', '20200106938494', '20200116825964', '20200116984039', '20200120640657'];
          if (specialBadLegacyCases.find(legacyCase => datePortionOfFileName == legacyCase)) continue;
          
          let isValidDate = moment(datePortionOfFileName, 'YYYYMMDDHHmmss', true).isValid();
          defaultLog.debug(datePortionOfFileName, 'is a valid date?', isValidDate);
          expect(true).toEqual(isValidDate);
        }
        done();
      });
    }, 50000);
  });
});
