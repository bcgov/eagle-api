const sinon = require('sinon');
const mongoose = require('mongoose');

/**
 * Runs a materialized view's update() against stubbed Mongoose and returns the aggregation pipeline
 * it handed to Audit.aggregate, so a spec can assert pipeline shape without a database.
 */
async function capturePipeline(view, ...updateArgs) {
  let pipeline;
  const aggregate = sinon.stub().callsFake((stages) => {
    pipeline = stages.slice();
    return Promise.resolve([]);
  });

  sinon.stub(mongoose, 'model').returns({ aggregate });
  // A row back from find() puts the incremental branch in play, which aggregates without $out.
  sinon.stub(mongoose, 'connection').value({
    db: {
      collection: () => ({
        find: () => ({ limit: () => ({ toArray: async () => [{ _id: 1 }] }) }),
        bulkWrite: async () => {},
        createIndex: () => {}
      })
    }
  });

  try {
    await view.update({ debug() {} }, ...updateArgs);
  } finally {
    sinon.restore();
  }

  return pipeline;
}

module.exports = capturePipeline;
