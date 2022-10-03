const constants = require('../helpers/constants').schemaTypes;

exports.createFavouriteAggr = (userId, type, field) => {
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