const constants = require('../helpers/constants').schemaTypes;

exports.createFavouriteAggr = (userId, type) => {
  const aggregation = [];
  aggregation.push(
    {
      $match: {
        _schemaName: constants.FAVOURITE,
        type: type,
        userId: userId
      }
    },
    {
      $lookup: {
        from: 'epic',
        localField: 'objId',
        foreignField: '_id',
        as: 'favourite'
      }
    },
    {
      $unwind: {
        path: '$favourite'
      }
    },
    {
      $replaceRoot: {
        newRoot: '$favourite'
      }
    },
    {
      $group: {
        _id: null,
        [`_ids`]: {$push: `$_id`}
      }
    },
    {
      $project: {
        _id: false,
        [`_ids`]: true
      }
    }
  );
  return aggregation;
};

exports.createFavouritesOnlyAggr = (userId, type) => {
  let aggregation = [];
  aggregation.push(
    {
      $lookup: {
        from: 'epic',
        localField: '_id',
        foreignField: 'objId',
        as: 'favourite'
      }
    },
    {
      $unwind: {
        path: '$favourite',
      }
    },
    {
      $match: {
        'favourite.type': { $eq: type},
        'favourite.userId': {$eq: userId}
      }
    }
  );
  return aggregation;
};