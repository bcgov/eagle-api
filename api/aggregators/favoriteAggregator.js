const constants = require('../helpers/constants').schemaTypes;

exports.createFavoriteAggr = (userId, type, field) => {
  const aggregation = [];
  aggregation.push(
    {
      $match: {
        _schemaName: constants.FAVORITE,
        type: type,
        userId: userId
      }
    },
    {
      $lookup: {
        from: 'epic',
        localField: 'objId',
        foreignField: '_id',
        as: 'favorite'
      }
    },
    {
      $unwind: {
        path: '$favorite'
      }
    },
    {
      $replaceRoot: {
        newRoot: '$favorite'
      }
    }
  );
  if (field !== undefined) {
    aggregation.push(
      {
        $group: {
          _id: null,
          [`${field}s`]: {$push: `$${field}`}
        }
      },
      {
        $project: {
          _id: false,
          [`${field}s`]: true
        }
      }
    );
  }
  return aggregation;
};

exports.createFavoritesOnlyAggr = (userId, type) => {
  let aggregation = [];
  aggregation.push(
    {
      $lookup: {
        from: 'epic',
        localField: '_id',
        foreignField: 'objId',
        as: 'favorite'
      }
    },
    {
      $unwind: {
        path: '$favorite',
      }
    },
    {
      $match: {
        'favorite.type': { $eq: type},
        'favorite.userId': {$eq: userId}
      }
    }
  );
  return aggregation;
};