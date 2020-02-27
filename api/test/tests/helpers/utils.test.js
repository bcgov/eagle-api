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

  test('Generate search terms for all words - `generateSearchTerms`', async (done) => {
    const testSentence = 'test three words';
    const wordsToProcess = 3;

    // Word search terms start at two.
    const expectedResults = ['te', 'tes', 'test', 'th', 'thr', 'thre', 'three', 'wo', 'wor', 'word', 'words'];

    const searchTerms = utils.generateSearchTerms(testSentence, wordsToProcess);

    expect(searchTerms).toHaveLength(expectedResults.length);
    expect(searchTerms).toEqual(expectedResults);
    done();
  });
});
