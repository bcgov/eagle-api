var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');

exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.removeFavourite = async function (args, res) {
  var objId = args.swagger.params.favouriteId.value;
  const userId = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.email : res.socket.remoteAddress;

  defaultLog.info('Deleting a Favourite');
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  if (!mongoose.Types.ObjectId.isValid(objId)) {
    return Actions.sendResponse(res, 400, {});
  }

  const query = { objId, userId };

  var Favourite = mongoose.model('Favourite');

  Favourite.remove(query, function (err, data) {
    if (data) {
      Utils.recordAction('Delete', 'Favourite', userId, data._id);
      return Actions.sendResponse(res, 200, data);
    } else {
      return Actions.sendResponse(res, 400, err);
    }
  });
};

exports.addFavourite = async function (args, res) {
  var obj = args.swagger.params.favourite.value;
  if (!mongoose.Types.ObjectId.isValid(obj.objId)) {
    return Actions.sendResponse(res, 400, {});
  }
  const userId = args.swagger.params.auth_payload ? args.swagger.params.auth_payload.email : res.socket.remoteAddress;
  obj = {...obj, userId};
  defaultLog.info('Incoming new object:', obj);

  var Favourite = mongoose.model('Favourite');

  var favObj = await Favourite.findOne(obj);

  if (favObj) {
    defaultLog.info('Favourite exists. Retuning object');
    return Actions.sendResponse(res, 200, obj);
  }

  // Define security tag defaults
  obj.read = ['sysadmin', 'staff'];
  obj.write = ['sysadmin', 'staff'];
  obj.delete = ['sysadmin', 'staff'];
  const favourite = new Favourite(obj);

  favourite
    .save()
    .then(function (newFavourite) {
      Utils.recordAction(
        'Post',
        'Favourite',
        args.swagger.params.auth_payload ? args.swagger.params.auth_payload.preferred_username : userId,
        newFavourite._id
      );
      return Actions.sendResponse(res, 200, newFavourite);
    })
    .catch(function (err) {
      console.log('Error in API:', err);
      return Actions.sendResponse(res, 400, err);
    });
};
