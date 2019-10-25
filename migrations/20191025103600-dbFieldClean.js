'use strict';

/**
  * dbFieldClean
  *   - remove any non-modelled or non-intrinsic (eg _id) field from the database
  *   - put the database in a state that matches the existing models on leading to more effective development, reporting, maintenance
  */


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
  let mongoHandle;
  return db.connection.connect(db.connectionString, { native_parser: true })
    .then(mongoInstance => {
      mongoHandle = mongoInstance;  // closable on err

      var epic = mongoHandle.collection('epic');
      epic.copyTo("epic-hotbackup-" + new Date(now).toISOString().replace(/([^0-9]+)/gi, ''));

    })
    .catch((e) => {
      console.log("e:", e);
    })
    .finally(function(){
      mongoHandle.close();
    });
};

exports.down = function(db) {
  return null;
};

exports._meta = {
  "version": 1
};
