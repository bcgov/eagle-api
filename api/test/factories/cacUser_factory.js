const factory = require('factory-girl').factory;
const CACUser = require('../../../helpers/models/cacUser');
let faker = require('faker/locale/en');

const factoryName = CACUser.modelName;

factory.define(factoryName, CACUser, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let attrs = {
    name: ''
    , email: ''
    , comment: ''
    , project: ''
    // Permissions
    , write: '["project-system-admin"]'
    , read: '["project-system-admin"]'
  };
  return attrs;
});

exports.factory = factory;
exports.name = factoryName;
