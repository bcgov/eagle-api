const request = require('supertest');
const test_helper = require('../../test_helper');
const generate_helper = require('../../generate-data/generate_helper');
const organization = require('../../../controllers/organization');

// Import any models used in the tests.
require('../../../helpers/models/organization');
require('../../../helpers/models/audit');

const app = test_helper.app;

describe('API Testing - organization', () => {
  const emptyParams = test_helper.buildParams({});
  const testUser = 'testUser';

  test('OPTION `/api/organization` returns 200', done => {
    app.options('/api/organization', (req, res) => {
      return organization.protectedOptions(emptyParams, res);
    });

    request(app)
      .options('/api/organization')
      .expect(200, done);
  });

  test('GET `/api/organization` returns 200', async (done) => {
    // Insert test documents.
    const NUMBER_OF_DOCS = 5;
    await generate_helper.generateSingleFactory('Organization', NUMBER_OF_DOCS, { read: ['sysadmin'] });

    app.get('/api/organization', (req, res) => {
      const paramsWithValues = test_helper.createSwaggerParams(['_id']);
      return organization.protectedGet(paramsWithValues, res);
    });

    request(app)
      .get('/api/organization')
      .expect(200)
      .end((err, res) => {
        if (err) {
          return done(err);
        }
        // Confirm the expected number of documents are returned.
        expect(res.body).toHaveLength(NUMBER_OF_DOCS);
        return done();
      });
  });

  test('POST `/api/organizaton` returns 200', done => {
    const newObservation = {
      description: '<p>Test</p>',
      name: 'Test Name',
      country: 'Canada',
      province: 'British Columbia',
      city: 'Adams Lake',
      address1: '1234 Test St',
      companyType: 'Other Agency'
    };

    app.post('/api/organization', (req, res) => {
      // Format params for POST request.
      const formattedObj = test_helper.createSwaggerBodyObj('org', req.body);
      const paramsWithValues = test_helper.createSwaggerParams([], formattedObj, testUser);
      return organization.protectedPost(paramsWithValues, res);
    });

    request(app)
      .post('/api/organization')
      .send(newObservation)
      .expect(200)
      .end((err, res) => {
        if (err) {
          return done(err);
        }
        // Confirm that the returned object matches the submitted one.
        expect(res.body).toMatchObject(newObservation);
        return done();
      });
  });
});
