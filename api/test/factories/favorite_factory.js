const factory = require('factory-girl').factory;
const Favorite = require('../../helpers/models/favorite');
let faker = require('faker/locale/en');

const factoryName = Favorite.modelName;

factory.define(factoryName, Favorite, buildOptions => {
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
