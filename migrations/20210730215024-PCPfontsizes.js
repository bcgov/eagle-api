'use strict';

const { mongo } = require("mongoose");

// list all collections that require this migration
const collections = ['epic']

function addH4Tag(instruction) {
  if (!instruction || instruction === null || instruction === 'undefined') {
    return '';
  }
  let firstSentence = instruction.split('<p>')[0];
  let secondSentence = instruction.split('<p>')[1];
  firstSentence = '<h4>' + firstSentence + '</h4>';
  return firstSentence + '<p>' + secondSentence;
}

function addH4TagAll(instruction) {
  if (!instruction || instruction === null || instruction === 'undefined') {
    return '';
  }
  return '<h4>' + instruction + '</h4>';
}


/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function (options, seedLink) {
};

exports.up = async function (db) {
  console.log('**** Updating PCP font sizes for specific records ****');

  const mClient = await db.connection.connect(db.connectionString, {
    native_parser: true
  });

  for (let collection of collections) {

    try {
      let currentCollection = await mClient.collection(collection);

      console.log(`Collection: ${collection}`);

      // We have to get the current value of the 'instructions' field and edit the html of the first sentence to change the font size.

      // Parkland Burnaby Refinery

      // Get the PCP ObjectId
      var documentID = new mongo.ObjectId("5f037b1f3a147c00223c6dee");

      // Get the text from instructions field and edit it
      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4Tag(instructionsText.instructions);

      // Update the instructions field
      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // North Town Gas Plant Expansion

      var documentID = new mongo.ObjectId("5fab14f19da64e002097384b");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4Tag(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Church Road Wellfield Site

      var documentID = new mongo.ObjectId("5f04b5d93a147c00223ce295");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4Tag(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Vopak Pacific Canada (1)

      var documentID = new mongo.ObjectId("60f098268b104600228ea660");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4Tag(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Vopak Pacific Canada (2)

      var documentID = new mongo.ObjectId("5fa04c9a97cae80021c5e633");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4Tag(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Vopak Pacific Canada (3)

      var documentID = new mongo.ObjectId("5b8869403f64cb00249e7a85");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4TagAll(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Tilbury Marine Jetty (1)

      var documentID = new mongo.ObjectId("5c8aea58d69ab9002440610e");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4TagAll(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

      // Tilbury Marine Jetty (2)

      var documentID = new mongo.ObjectId("61033d326039490022dd761f");

      var instructionsText = await currentCollection.find(documentID).next();
      instructionsText = addH4TagAll(instructionsText.instructions);

      await currentCollection.updateOne(
        { _id: documentID },
        { $set: { instructions: instructionsText } }
      );

    } catch (err) {
      console.log(`Error updating project commenting period (${collection}): ${err}`);
    }
  }
  console.log(`**** Finished updating PCP font sizes for specific records`);
  mClient.close();

  return null;
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  "version": 1
};
