const factory = require('factory-girl').factory;
const Audit = require('../../helpers/models/audit');
const mongoId = require('mongoose').Types.ObjectId();

factory.define('audit', Audit, {
    // objId: new mongoId(),
    action: "mock",
    meta: "mock",
    _objectSchema: "mock",
    addedBy: "factory-girl",
    updatedBy: "factory-girl",
    deletedBy: "factory-girl",
    performedBy: "factory-girl",
    timestamp: Date.now(),
    // Permissions
    write: '["project-system-admin"]',
    read: '["project-system-admin"]',
    delete: '["project-system-admin"]'
});

exports.factory = factory;
