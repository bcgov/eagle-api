'use strict';



let listItems = require(process.cwd() + '/migrations_data/lists/20191008204532-new-authors_docTypes_labels_projectPhases.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    console.log("Setting current lists to 2002 legislation")
    p.updateMany(
      {
        _schemaName: "List", type: "author"
      },
      {
        $set: { legislation: 2002 }
      }
    ).catch((e) => {
      console.log("error: ", e);
    });

    p.updateMany(
      {
        _schemaName: "List", type: "doctype"
      },
      {
        $set: { legislation: 2002 }
      }
    ).catch((e) => {
      console.log("error: ", e);
    });
    // apply order field
    let docList_order = [0, 1, 2, 6, 10, 11, 14, 4, 3, 5, 13, 16, 15, 17, 18, 19, 7, 8, 9, 12];
    p.aggregate([
      { $match: {_schemaName:"List", type: "doctype"} }
    ])
      .toArray()
      .then((arr) => {
        let i = 0;
        for (let item of arr) {
          p.update(
            { _id: item._id },
            {
              $set: { listOrder: docList_order[i] }
            }
          )
          i++;
        }
      }
      ).catch((e) => {
        console.log("error: ", e);
    });

    p.updateMany(
      {
        _schemaName: "List", type: "projectPhase"
      },
      {
        $set: { legislation: 2002 }
      }
    ).catch((e) => {
      console.log("error: ", e);
    });
    // milestones
    p.updateMany(
      {
        _schemaName: "List", type: "label"
      },
      {
        $set: { legislation: 2002 }
      }
    ).catch((e) => {
      console.log("error: ", e);
    });

    // insert new lists
    console.log("Inserting 2018 list updates")
    p.insertMany(listItems)
      .then(function (arr) {
        for(let item of arr.ops) {
          p.update(
            {
              _id: item._id
            },
            {
              $set: { read: ['public', 'staff', 'sysadmin'], write: ['staff', 'sysadmin'] }
            }
          );
        }
      })
      .catch((e) => {
        console.log("err: ", e)
      });
  },

  async down(db, client) {
    return null;
  }
};
