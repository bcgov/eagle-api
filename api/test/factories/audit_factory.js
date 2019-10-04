const factory = require('factory-girl').factory;
const Audit = require('../../helpers/models/audit');
let faker = require('faker/locale/en');

factory.define('audit', Audit, buildOptions => {
    if (buildOptions.faker) faker = buildOptions.faker;

    let attrs = {
          action: "mock"
        , meta: "mock"
        , _objectSchema: "mock"
        , addedBy: ''
        , updatedBy: ''
        , deletedBy: ''
        , performedBy: ''
        , timestamp: Date.now()
        // Permissions
        , write: '["project-system-admin"]'
        , read: '["project-system-admin"]'
        , delete: '["project-system-admin"]'
    }
    return attrs;
});

exports.factory = factory;
