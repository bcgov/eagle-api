const factory = require('factory-girl').factory;
const Favourite = require('../../helpers/models/favourite');
let faker = require('faker/locale/en');

const factoryName = Favourite.modelName;

factory.define(factoryName, Favourite, buildOptions => {
    if (buildOptions.faker) faker = buildOptions.faker;

    let attrs = {
        userId: ''
        , type: ''
        , objId: factory_helper.ObjectId()
        , createdAt: new Date()
        , updatedAt: new Date()
        // Permissions
        , write: '["project-system-admin"]'
        , read: '["project-system-admin"]'
      };
    return attrs;
});

exports.factory = factory;
exports.name = factoryName;
