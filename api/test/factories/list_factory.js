const factory = require('factory-girl').factory;
const List = require('../../helpers/models/list');

factory.define('list', List, buildOptions => {
  let attrs = {
    //TODO integrate this with the lists we populated from the migrations we run on gen init
  };
  return attrs;
});

exports.factory = factory;
