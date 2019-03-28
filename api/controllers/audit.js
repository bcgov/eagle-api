var auth = require("../helpers/auth");
var _ = require('lodash');
var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var tagList = [
    'timestamp',
    'performedBy',
    'deletedBy',
    'updatedBy',
    'addedBy',
    '_objectSchema',
    'action'
];

var getSanitizedFields = function (fields) {
    return _.remove(fields, function (f) {
        return (_.indexOf(tagList, f) !== -1);
    });
}

exports.protectedOptions = function (args, res, rest) {
    res.status(200).send();
};

exports.protectedGet = async function (args, res, next) {
    var skip = null, limit = null, sort = {};
    var query = {};

    if (args.swagger.params.auditId && args.swagger.params.auditId.value) {
        query = Utils.buildQuery("_id", args.swagger.params.auditId.value, query);
    }
    if (args.swagger.params.sortBy && args.swagger.params.sortBy.value) {
        args.swagger.params.sortBy.value.forEach(function (value) {
            var order_by = value.charAt(0) == '-' ? -1 : 1;
            var sort_by = value.slice(1);
            sort[sort_by] = order_by;
        }, this);
    }
    var processedParameters = Utils.getSkipLimitParameters(args.swagger.params.pageSize, args.swagger.params.pageNum);
    skip = processedParameters.skip;
    limit = processedParameters.limit;

    // Set query type
    // _.assignIn(query, { "_schemaName": "Audit" });

    console.log("QUERY:", query, args.swagger.params.auth_payload.realm_access.roles);

    var data = await Utils.runDataQuery('Audit',
        args.swagger.params.auth_payload.realm_access.roles,
        query,
        getSanitizedFields(args.swagger.params.fields.value), // Fields
        null, // sort warmup
        sort, // sort
        skip, // skip
        limit, // limit
        null, // pipeline warmup
        true, // count
        false) // useRoles
    return Actions.sendResponse(res, 200, data);
};
