'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    //create new field
    p.updateMany(
      { _schemaName: "Document" },
      { $set: { "documentAuthorType": null } }
    )
    //move any objectIds in documentAuthor to new field
    p.aggregate([
      { $match: {_schemaName:"Document", documentAuthor: {$type: 'objectId'}}}
    ])
      .toArray()
      .then((arr) => {
        console.log("moving author ObjectId to authorType field")
        for (let item of arr) {
          p.update(
            { _id: item._id },
            {
              $set: { documentAuthorType: item.documentAuthor }
            }
          )
          p.update(
            { _id: item._id },
            { 
              $set: { documentAuthor: ''}
            }
          )
        }
    })
    //set type for some known documentAuthor values
    p.aggregate([
      { $match: { _schemaName: "Document" } }
    ])
      .toArray()
      .then((arr) => {
        console.log("updating type for public, epic, epic data conversion")
        for (let item of arr) {
          var docAuthor = item.documentAuthor;
          if (docAuthor) {
            if (docAuthor === 'EPIC' || docAuthor === 'EPIC DATA CONVERSION') {
              //SET TO EAO ObjectID  "5cf00c03a266b7e1877504db"
              var eao_id = mongoose.Types.ObjectId("5cf00c03a266b7e1877504db")
              p.update(
                { _id: item._id },
                {
                  $set: { documentAuthorType: eao_id}
                }
              )
            } else if (docAuthor === 'public') {
              //SET to PUBLIC ObjectID "5cf00c03a266b7e1877504df"
              var public_id = mongoose.Types.ObjectId("5cf00c03a266b7e1877504df")
              p.update(
                { _id: item._id },
                {
                  $set: {documentAuthorType: public_id}
                }
              )
            }
          }
        }
      })
        .catch((err) => {
          console.log("err: ", err);
      });
  },

  async down(db, client) {
    return null;
  }
};
