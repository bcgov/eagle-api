const factory = require('factory-girl').factory;
const factory_helper = require('./factory_helper');
const Group = require('../../helpers/models/group');
let faker = require('faker/locale/en');

const factoryName = Group.modelName;

factory.define(factoryName, Group, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;
  factory_helper.faker = faker;

  let usersPool = (buildOptions.usersPool) ? buildOptions.usersPool : [];
  let members = [];
  if (0 < usersPool.length) {
    const defaultGroupSizeCeiling = 15;
    let groupSizeCeiling = (usersPool.length < defaultGroupSizeCeiling) ? usersPool.length : defaultGroupSizeCeiling;
    let groupRandomSize = 1 + faker.random.number(groupSizeCeiling - 1);  // 1-15 not 0-15
    for (i = 0; i < groupRandomSize; i++) {
      let userId = factory_helper.getRandomExistingMongoId(usersPool);
      if (-1 == members.indexOf(userId)) members.push(userId);
    }
  }

  let attrs = {
      _id              : factory_helper.ObjectId()
    , name             : factory.seq('Group.name', (n) => `Group-${n}`)
    , project          : factory_helper.ObjectId()
    , members          : members

    , read             : faker.random.arrayElement(["public", "sysadmin", ["public", "sysadmin"]])
    , write            : faker.random.arrayElement(["public", "sysadmin", ["public", "sysadmin"]])
    , delete           : faker.random.arrayElement(["public", "sysadmin", ["public", "sysadmin"]])
    , links: []
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
