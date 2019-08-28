'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
  let mClient;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then((mClientInst) => {
      // mClientInst is an instance of MongoClient
      mClient = mClientInst;
      var p = mClient.collection('epic');

      // these are the projects that are under the 1996 legislation.
      // At this time all other projects were under the 2002 legislation.
      // NOTE: epicProjectId is depreciated now
      const epicProjectIds1996Legislation = [
          45,
          129,
          152,
          84,
          140,
          132,
          21,
          77,
          145,
          78,
          85,
          9,
          52,
          16,
          34,
          8,
          79,
          31,
          80,
          86,
          41,
          82,
          81,
          10,
          3,
          22,
          27,
          42,
          141,
          57,
          65,
          23,
          139,
          30,
          46,
          56,
          7,
          146,
          127,
          48,
          64,
          186,
          12,
          37,
          62,
          4,
          184,
          47,
          54,
          29,
          188,
          51,
          39,
          36,
          35,
          68,
          33,
          72,
          5,
          44,
          40,
          13,
          26
        ];

      let projectLegislation = '';

      p.aggregate([
        {
          $match: { _schemaName: "Project" }
        }
      ])
        .toArray()
        .then(function (arr) {
          for (let item of arr) {
            projectLegislation = '2002 Environmental Assessment Act';

            for (let epicProjId of epicProjectIds1996Legislation){
              if (item.epicProjectID === epicProjId){
                projectLegislation = '1996 Environmental Assessment Act';
                break;
              }
            }

            p.update(
              {
                _id: item._id
              },
              {
                $set: { legislation: projectLegislation }
              });
          }
          mClient.close();
        });
    })
    .catch((e) => {
      console.log("e:", e);
      mClient.close()
    });};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
