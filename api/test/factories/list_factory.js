const factory = require('factory-girl').factory;
const List = require('../../helpers/models/list');
//const _ = require('lodash');
let faker = require('faker/locale/en');

const factoryName = List.modelName;

const ListArray1 = require('../../../migrations_data/lists.js');
const ListArray2 = require('../../../migrations_data/new_list_items.js');
const ListArray3 = require('../../../migrations_data/newProjectPhaseListItems.js');
const ListArray4 = require('../../../migrations_data/regionList.js');
const allListEntries = [].concat(ListArray1).concat(ListArray2).concat(ListArray3).concat(ListArray4);

let allLists = {};

for (let i=0; i<allListEntries; i++) {
  let type = allListEntries[i].type;
  let name = allListEntries[i].name
  if (!(type in allLists)) allLists[type] = [];
  if (!allLists[type].includes(name)) allLists[type].push(name);
}

factory.define(factoryName, List, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  let randomListSample = {};
  let type = "";
  let name = "";
  if ((type in buildOptions) && (buildOptions.type)) {
    type = buildOptions.type;
    randomListSample = faker.random.arrayElement(allLists[type]);
    name = randomListSample;
  } else {
    randomListSample = faker.random.arrayElement(allListArr);
    type = randomListSample.type;
    name = randomListSample.name
  }

  let attrs = {
      name         : name
    , type         : type
    , item         : null
    , guid         : require('mongoose').Types.ObjectId()
    , read         : '["public"]'
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
exports.allLists = allLists;
