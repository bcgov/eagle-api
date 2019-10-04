const factory = require('factory-girl').factory;
const List = require('../../helpers/models/list');
let faker = require('faker/locale/en');

factory.define('list', List, buildOptions => {
  if (buildOptions.faker) faker = buildOptions.faker;

  let attrs = {
    //TODO integrate this with the lists we populated from the migrations we run on gen init
  };
  return attrs;
});

exports.factory = factory;
