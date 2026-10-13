var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
const ALLOWED_FIELDS = [
  'code',
  'description',
  'name',
  'parent',
  'pillar',
  'project',
  'stage',
  'title',
  'type'
];

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.protectedGet = async function (args, res) {
  var skip = null, limit = null, sort = {};
  var query = {};

  if (args.swagger.params.vcId && args.swagger.params.vcId.value) {
    query = Utils.buildQuery('_id', args.swagger.params.vcId.value, query);
  }
  if (args.swagger.params.projectId && args.swagger.params.projectId.value) {
    let projId;
    try {
      projId = Utils.getValidObjectId(args.swagger.params.projectId);
    } catch (e) {
      return Actions.sendResponse(res, 400, {});
    }
    Object.assign(query, { project: projId });
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
  Object.assign(query, { '_schemaName': 'Vc' });

  var data = await Utils.runDataQuery('Vc',
    args.swagger.params.auth_payload.realm_access.roles,
    query,
    Utils.sanitizeFields(args.swagger.params.fields.value, ALLOWED_FIELDS), // Fields
    null, // sort warmup
    sort, // sort
    skip, // skip
    limit, // limit
    true); // count
  Utils.recordAction('Get', 'Vc', args.swagger.params.auth_payload.preferred_username, args.swagger.params.vcId && args.swagger.params.vcId.value ? args.swagger.params.vcId.value : null);
  return Actions.sendResponse(res, 200, data);
};
