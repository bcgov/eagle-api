var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.removeFavorite = async function (args, res) {
  var objId = args.swagger.params.favoriteId.value;
  const userId = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.email : res.socket.remoteAddress;

  defaultLog.info('Deleting a Favorite');
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }

  const query = { objId, userId };

  var Favorite = mongoose.model('Favorite');

  Favorite.remove(query, function (err, data) {
    if (data) {
      Utils.recordAction('Delete', 'Favorite', userId, data._id);
      return Actions.sendResponse(res, 200, data);
    } else {
      return Actions.sendResponse(res, 400, err);
    }
  });
};

exports.addFavorite = async function (args, res) {
  var obj = args.swagger.params.favorite.value;
  if (!mongoose.Types.ObjectId.isValid(obj.objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const userId = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.email : res.socket.remoteAddress;
  obj = {...obj, userId};

  defaultLog.info('Incoming new object:', obj);

  var Favorite = mongoose.model('Favorite');

  var favObj = await Favorite.findOne(obj);

  if (favObj) {
    defaultLog.info('Favorite exists. Retuning object');
    return Actions.sendResponse(res, 200, obj);
  }

  // Define security tag defaults
  obj.read = ['sysadmin', 'staff'];
  obj.write = ['sysadmin', 'staff'];
  obj.delete = ['sysadmin', 'staff'];
  const favorite = new Favorite(obj);

  favorite
    .save()
    .then(function (newFavorite) {
      Utils.recordAction(
        'Post',
        'Favorite',
        args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : userId,
        newFavorite._id
      );
      return Actions.sendResponse(res, 200, newFavorite);
    })
    .catch(function (err) {
      console.log('Error in API:', err);
      return Actions.sendResponse(res, 400, err);
    });
};
