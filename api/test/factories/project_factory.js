const factory = require('factory-girl').factory;
const Project = require('../../helpers/models/project');

factory.define('project', Project, {
    name: "test"
});

exports.factory = factory;