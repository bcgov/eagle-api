const factory = require('factory-girl').factory;
const _ = require('lodash');
const glob = require("glob");
const factory_helper = require('./factory_helper');
const List = require('../../helpers/models/list');
const app_helper = require('../../../app_helper');
let defaultLog = app_helper.defaultLog;
let faker = require('faker/locale/en');

const factoryName = List.modelName;
const listFileMatchPattern = "./migrations_data/lists/*.js";
let _allListsLookupDict = {};
let allLists = [];

function refreshListsFromMigrationData() {
  glob(listFileMatchPattern, function(err, files) { // lists/**/*.js
    if (err) {
      defaultLog.error("cannot match pattern '" + listFileMatchPattern + "'", err);
      return;
    }
    if (!((!!files) && (Array === files.constructor))) {
      defaultLog.error("object 'files' is not an array");
      return;
    }
    let revFiles = files.sort().reverse();
    defaultLog.debug(revFiles);

    let allListEntries = [];
    revFiles.forEach(function(file) {
      defaultLog.debug(file);
      allListEntries = allListEntries.concat(require(file.replace(/^\.\//g, "../../../")));
    });
    defaultLog.debug(allListEntries);

    for (let i=0; i<allListEntries.length; i++) {
      let mde = allListEntries[i]; // migration_data entry
      let key;
      let subKey = {};
      let meta = {};
      let oldName;
      for (var field in mde) {
        if (mde.hasOwnProperty(field)) {
          switch(field) {
            case "type":
              key = mde[field];
              break;
            case "name":
            case "legislation":
              subKey[field] = mde[field];
              break;
            case "oldName":
              oldName = mde[field];
              break;
            case "_schemaName":
              break;
            default:
              meta[field] = mde[field];
              break;
          }
        }
      }

      if ((_.isEmpty(key)) || (isSpecialCaseToIgnore(mde))) continue;

      if (!(key in _allListsLookupDict)) _allListsLookupDict[key] = [];
      if (subKey.hasOwnProperty("name")) {
        if ((!_.isEmpty(oldName)) && (!_.isEmpty(subKey.name))) {
          let preventThisSubKey = subKey;
          preventThisSubKey.name = oldName;
          addLookupWithoutDuplicates(false, key, preventThisSubKey, meta);
        }
      }
      addLookupWithoutDuplicates(true, key, subKey, meta);
    }
  });
}

function isSpecialCaseToIgnore(migrationDataEntry) {
  // skip any entries we specifically don't want because they were manually deleted in migrations
  return (("label" === migrationDataEntry.type 
  && "Time Limit Extension" === migrationDataEntry.name 
  && 2018 === migrationDataEntry.legislation
  && 14 === migrationDataEntry.listOrder
  && !migrationDataEntry.hasOwnProperty("read")
  && !migrationDataEntry.hasOwnProperty("write"))
  // || (next entry to ignore...)
  ); 
}

function addLookupWithoutDuplicates(addToList, key, subKey, meta) {
  if (!_allListsLookupDict[key].includes(subKey)) {
    _allListsLookupDict[key].push(subKey);
    let newListEntry = {type: key};
    for (var field in subKey) {
      if (subKey.hasOwnProperty(field)) newListEntry[field] = subKey[field];
    }
    for (var field in meta) {
      if (meta.hasOwnProperty(field)) newListEntry[field] = meta[field];
    }
    defaultLog.debug("fields = " + JSON.stringify(newListEntry));
    if (true === addToList) allLists.push(newListEntry);
  }
}

function getAllLists() {
  if (0 == allLists.length) refreshListsFromMigrationData();
  return allLists;
}

factory.define(factoryName, List, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let randomListSample = {};
  let type = "";
  let name = "";
  if ((type in buildOptions) && (buildOptions.type) && (name in buildOptions) && (buildOptions.name)) {
    type = buildOptions.type;
    name = buildOptions.name;
  } else if ((type in buildOptions) && (buildOptions.type)) {
    type = buildOptions.type;
    randomListSample = faker.random.arrayElement(allLists[type]);
    name = randomListSample;
  } else if ((name in buildOptions) && (buildOptions.name)) {
    randomListSample = faker.random.arrayElement(allLists);
    type = randomListSample.type;;
    name = buildOptions.name;
  } else {
    randomListSample = faker.random.arrayElement(allLists);
    type = randomListSample.type;
    name = randomListSample.name
  }

  let attrs = {
      _id          : factory_helper.ObjectId()
    , name         : name
    , type         : type
    , item         : null
    , guid         : factory_helper.ObjectId()
    , read         : ["public", "sysadmin", "staff"]
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
exports.allLists = getAllLists();
exports.listFileMatchPattern = listFileMatchPattern;
exports.refreshListsFromMigrationData = refreshListsFromMigrationData;
