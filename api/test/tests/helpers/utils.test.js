const mongoose = require('mongoose');
const utils = require('../../../helpers/utils');

// Import for automatic database setup.
require('../../test_helper');

// Import any models used in the tests.
require('../../../helpers/models/audit');

describe('Helper Testing - utils', () => {
  test('Record Audit action - `recordAction`', async (done) => {
    const testAction = 'Test Action';
    const testMeta = 'Test Meta Data';
    const testUser = 'TestUser';

    await utils.recordAction(testAction, testMeta, testUser);

    // Retrieve the record.
    const Audit = mongoose.model('Audit');
    const testRecord = await Audit.findOne({ 
        _objectSchema: 'Query',
        action: testAction,
        meta: testMeta,
        performedBy: testUser
    });

    expect(testRecord.action).toBe(testAction);
    expect(testRecord.meta).toBe(testMeta);
    expect(testRecord.performedBy).toBe(testUser);
    done();
  });
});
