'use strict';

module.exports = {
  async up(db, client) {
    var p = db.collection('epic');
    p.createIndex( {
      displayName: "text",
      name: "text",
      description: "text",
      eacDecision: "text",
      location: "text",
      region: "text",
      commodity: "text",
      type: "text",
      epicProjectId: "text",
      sector: "text",
      status: "text",
      labels: "text",
      code: "text" },
      {
          weights: {
              name: 9000,
              displayName: 8500,
              description: 8000,
              milestone: 7000,
              headline: 1,
              content: 1,
              label: 6000,
              documentFileName: 5000,
              type: 4000,
              documentAuthor: 3000,
              datePosted: 2500,
              dateUploaded: 2000,
              orgName: 1
          },
          name: "searchIndex_1"
      }
    );
    // TODO: Create a collation that does a case insensitive search
  },

  async down(db, client) {
    return null;
  }
};
