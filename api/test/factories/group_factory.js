const factory = require('factory-girl').factory;
const Group = require('../../helpers/models/group');

factory.define('group', Group, buildOptions => {
  let attrs = {
      name                    : factory.seq('Group.name', (n) => `Group-${n}`)
    , project                 : require('mongoose').Types.ObjectId()
    , members                 : [require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId(), require('mongoose').Types.ObjectId()]

    , read             : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , write            : faker.random.arrayElement(['["public"]', '["sysadmin"]'])
    , delete           : faker.random.arrayElement(['["public"]', '["sysadmin"]'])

  };
  if (buildOptions.public) { 
    attrs.tags = [['public'], ['sysadmin']];
  } else if (buildOptions.public === false) {
    attrs.tags = [['sysadmin']];
  }
  return attrs;
});

exports.factory = factory;
