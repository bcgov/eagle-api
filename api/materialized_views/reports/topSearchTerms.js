const mongoose = require('mongoose');
const constants = require('../constants');

async function update(defaultLog, afterTimestamp) {
  const queryAggregates = [
    {
      $project: {
        "meta": "$meta",
        "action": "$action",
        "timestamp": "$timestamp"
      }
    },
    {
      $match: {
        "action": { $eq: "Search" },
        "timestamp": { $gt: new Date(afterTimestamp) }
      }
    },
    {
      $project: {
        "_id": "$_id",
        "___group": { "meta": "$meta" },
        "timestamp": "$timestamp"
      }
    },
    {
      $group: {
        "_id": "$___group",
        "count": { $sum: 1 },
        "latest": { $max: "$timestamp" }
      }
    },
    {
      $project: {
        "_id": { $ifNull: ["$_id.meta", "\\nnull\\n"] },
        "count": true,
        "latest": true
      }
    }
  ];

  if (constants.minDate !== afterTimestamp) {
    defaultLog.debug('checking if need to update read_only__reports__top_search_terms');

    const latestSinceLastRun = await mongoose.model('Audit').aggregate(queryAggregates);

    latestSinceLastRun.forEach(recentlyUpdated => {
      const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
      collection.updateOne({
        "_id": recentlyUpdated['_id'],
        "latest": { "$ne": recentlyUpdated['latest'] }
      },
      {
        $inc: { "count": recentlyUpdated['count'] },
        $set: { "latest": recentlyUpdated['latest'] }
      },
      {
        upsert: true,
      });

      defaultLog.debug('updated "' + recentlyUpdated['_id'] + '" to \'' + recentlyUpdated['latest'] + '\' and incremented count by ' + recentlyUpdated['count'] +']');
    });
  } else {
    defaultLog.debug('initializing read_only__reports__top_search_terms');

    queryAggregates.push({$out: "read_only__reports__top_search_terms"});
    await mongoose.model('Audit').aggregate(queryAggregates);

    const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
    collection.createIndex({latest: 1});
  }
}

async function get_last(defaultLog) {
  const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
  if (!collection) {
    return constants.minDate;
  }

  const result = await collection.find({}, { projection: { "_id":0, "latest":1 } }).sort({ "latest": -1 }).limit(1).toArray();

  if (result.length === 0) {
    return constants.minDate;
  }

  defaultLog.debug('last update to search terms was: ' + new Date(result[0].latest));

  return new Date(result[0].latest);
}

exports.update = update;
exports.get_last = get_last;