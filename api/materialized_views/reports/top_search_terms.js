const mongoose      = require('mongoose');
const consts        = require('../consts');

async function update(defaultLog, afterTimestamp) {
  let queryAggregates = [
    {$project:{
      "meta":"$meta",
      "action":"$action",
      "timestamp":"$timestamp"
    }},
    {$match:{
      $and:[
        {$or:[
          {"action":{$eq:"search"}},
          {"action":{$eq:"Search"}}]},
        {"timestamp":{$gt: new Date(afterTimestamp) }}
      ]
    }},
    {$project:{
      "_id":"$_id",
      "___group":{"meta":"$meta"},
      "timestamp":"$timestamp"
    }},
    {$group:{
      "_id":"$___group",
      "count":{$sum:1},
      "latest":{$max:"$timestamp"}
    }},
    {$project:{
      "_id": {$ifNull: ["$_id.meta", "\\nnull\\n"]},
      "count": true,
      "latest": true
    }}
  ];
  if (consts.minDate != afterTimestamp) {
    defaultLog.debug('checking if need to update read_only__reports__top_search_terms');
    let latestSinceLastRun = await mongoose.model('Audit').aggregate(queryAggregates);
    latestSinceLastRun.map((recentlyUpdated) => {
      const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
      collection.updateOne({
        "_id":recentlyUpdated['_id'],
        "latest":{"$ne": recentlyUpdated['latest']}
      },
      { $inc: {
        "count": recentlyUpdated['count']}
      });
      collection.updateOne({
        "_id":recentlyUpdated['_id'],
        "latest":{"$ne": recentlyUpdated['latest']}
      },
      { $set: {
        "latest": recentlyUpdated['latest']}
      });
      defaultLog.debug('updated "' + recentlyUpdated['_id'] + '" to \'' + recentlyUpdated['latest'] + '\' and incremented count by ' + recentlyUpdated['count'] +']');
    });
  } else {
    defaultLog.debug('initializing read_only__reports__top_search_terms');
    queryAggregates.push({$out: "read_only__reports__top_search_terms"}); // mongodb 3.6
    // queryAggregates.push({ $merge: { into: "read_only__reports__top_search_terms", whenMatched: "replace" } }); // mongodb 4.2
    await mongoose.model('Audit').aggregate(queryAggregates);
    const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
    collection.createIndex({_id: 1});
    collection.createIndex({count: 1});
    collection.createIndex({latest: 1});
  }
}

async function get_last(defaultLog) {
  const collection = mongoose.connection.db.collection('read_only__reports__top_search_terms');
  if (!collection) return consts.minDate;
  let result = await collection.find({}, {"_id":0, "latest":1}).sort({"latest":-1}).limit(1).toArray();
  if (0 == result.length) return consts.minDate;
  defaultLog.debug('last update to search terms was: ' + new Date(result[0].latest));
  return new Date(result[0].latest);
}

exports.update = update;
exports.get_last = get_last;
