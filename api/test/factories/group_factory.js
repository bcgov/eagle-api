const factory = require('factory-girl').factory;
const Group = require('../../helpers/models/group');
let faker = require('faker/locale/en');

factory.define('group', Group, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let attrs = {
      name                    : factory.seq('Group.name', (n) => `Group-${n}`)
    , project                 : require('mongoose').Types.ObjectId()
    , members                 : [require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId()]

    , read             : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , write            : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , delete           : faker.random.arrayElement(['["public"]', '["sysadmin"]'])

  };
  return attrs;
});

exports.factory = factory;
