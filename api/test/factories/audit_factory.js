const factory = require('factory-girl').factory;
const Audit = require('../../helpers/models/audit');

factory.define('audit', Audit, {
    action: "mock",
    meta: "mock",
    _objectSchema: "mock",
    addedBy: '',
    updatedBy: '',
    deletedBy: '',
    performedBy: '',
    timestamp: Date.now(),
    // Permissions
    write: '["project-system-admin"]',
    read: '["project-system-admin"]',
    delete: '["project-system-admin"]'
});

exports.factory = factory;
