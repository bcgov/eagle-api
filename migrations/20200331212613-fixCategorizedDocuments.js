'use strict';

/**
 * This migration fixes any documents that have invalid IDs in their type, documentAuthorType, or milestone fields.
 * Any documents that do not have a value in those fields that is from the List schema will be set to `null`.
 */

module.exports = {
  async up(db, client) {
    const collection = db.collection('epic');

    // Get all of the valid document types.
    const docResults = await collection.aggregate([
      {
        $match: { _schemaName: 'List', type: 'doctype' }
      },
    ]).toArray();

    // Get all of the valid milestones.
    const milestoneResults = await collection.aggregate([
      {
        $match: { _schemaName: 'List', type: 'label' }
      },
    ]).toArray();

    // Get all of the valid author types.
    const authorResults = await collection.aggregate([
      {
        $match: { _schemaName: 'List', type: 'author' }
      },
    ]).toArray();

    const docTypes = docResults.map(type => type._id);
    const milestones = milestoneResults.map(milestone => milestone._id);
    const authorTypes = authorResults.map(author => author._id);

    // Update all documents with invalid type.
    const typeResult = await collection.updateMany(
      {
        _schemaName: 'Document',
        type: { $nin: docTypes }
      },
      {
        $set: { type: null }
      }
    );
    console.log('***** Number of document types that were updated *****');
    console.log(typeResult.modifiedCount);

    // Update all documents with invalid milestones.
    const milestoneResult = await collection.updateMany(
      {
        _schemaName: 'Document',
        milestone: { $nin: milestones }
      },
      {
        $set: { type: null }
      }
    );
    console.log('***** Number of document milestones that were updated *****');
    console.log(milestoneResult.modifiedCount);

    // Update all documents with invalid milestones.
    const authorResult = await collection.updateMany(
      {
        _schemaName: 'Document',
        documentAuthorType: { $nin: authorTypes }
      },
      {
        $set: { type: null }
      }
    );
    console.log('***** Number of document author types that were updated *****');
    console.log(authorResult.modifiedCount);
  },

  async down(db, client) {
    return true;
  }
};
