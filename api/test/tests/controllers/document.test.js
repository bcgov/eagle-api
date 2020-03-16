const request = require('supertest');
const test_helper = require('../../test_helper');
const generate_helper = require('../../data_generators/generate_helper');
const document = require('../../../controllers/document');

// Import any models used in the tests.
require('../../../helpers/models/document');
require('../../../helpers/models/audit');

const app = test_helper.app;

describe('API Testing - document', () => {
  const emptyParams = test_helper.buildParams({});
  const testUser = 'testUser';

  test('OPTION `/api/document` returns 200', done => {
    app.options('/api/document', (req, res) => {
      return document.protectedOptions(emptyParams, res);
    });

    request(app)
      .options('/api/document')
      .expect(200, done);
  });

  test('PUT `/api/document` returns 200', async  (done) => {
    // currently only tests editing document sortOrder
    // todo: test other parts of document put
    console.log('Generate document');
    const NUMBER_OF_DOCS = 1;
    const generatedDoc = await generate_helper.generateSingleFactory(
      'Document',
      NUMBER_OF_DOCS,
      {
        read: ['sysadmin']
      }
    );

    console.log('Edit sort order');

    const newSortOrder = (generatedDoc[0].sortOrder + 10);
    const newObservation = {
      docId: { value: generatedDoc[0]._id },
      sortOrder: { value: newSortOrder }
    };

    const putDocumentQuery = '/api/document/' + generatedDoc[0]._id;

    app.put(putDocumentQuery, (req, res) => {
      const paramsWithValues = test_helper.createSwaggerParams([], req.body, testUser);

      const returnValue = document.protectedPut(paramsWithValues, res);

      return returnValue;
    });

    request(app)
      .put(putDocumentQuery)
      .send(newObservation)
      .expect(200)
      .end((err, res) => {
        if (err) {
          return done(err);
        }
        // Confirm that the returned sort order matches the submitted one.
        expect(res.body.sortOrder.toString()).toMatch(newSortOrder.toString());
        return done();
      });
  });
});
