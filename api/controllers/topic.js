var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
const ALLOWED_FIELDS = [
  'description',
  'name',
  'type',
  'pillar',
  'parent',
];

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedGet = async function (args, res) {
  var skip = null, limit = null, sort = {}, query = {};

  if (args.swagger.params.topicId && args.swagger.params.topicId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.topicId.value, query);
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
  Object.assign(query, { '_schemaName': 'Topic' });

  var data = await Utils.runDataQuery('Topic',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS), // Fields
    null, // sort warmup
    sort, // sort
    skip, // skip
    limit, // limit
    true); // count
  Utils.recordAction('Get', 'Topic', args.swagger.params.auth_payload.preferred_username, args.swagger.params.topicId && args.swagger.params.topicId.value ? args.swagger.params.topicId.value : null);
  return Actions.sendResponse(res, 200, data);
};
