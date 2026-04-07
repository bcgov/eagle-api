'use strict';


let listItems = require(process.cwd() + '/migrations_data/lists/20191219230142-new-docTypes.js');

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    //Add in new objects
    p.insert(listItems.newDocList)
    p.aggregate([
      { $match: {_schemaName:"List", type: "doctype"} }
    ])
    .toArray()
    .then(function(arr) {
      for (let item of arr) {
        const doctypeName = item.name;
        const legislation = item.legislation;
        const lookupList = getListObject(listItems.docList, doctypeName, legislation);
        if (lookupList) {
          p.update(
            {
              _id: item._id
            },
            {
              $set: {
                name: lookupList.name,
                listOrder: lookupList.listOrder
              }
            }
          )
        }
        }
    })
  },

  async down(db, client) {
    return null;
  }
};
