/**
 * POST /public/comment and POST /public/document must not reach a controller, the database or
 * object storage. Requests go through the real swagger and router.
 */
const { expect } = require('chai');
const sinon = require('sinon');
const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const request = require('supertest');
const YAML = require('js-yaml');

const createRouter = require('../../api/middleware/swagger-router');
const MinioController = require('../../api/helpers/minio');

const OID = '5f4c7d1e2b3a4c5d6e7f8091';

describe('public write routes removed', () => {
  let app;

  before(() => {
    const spec = YAML.load(
      fs.readFileSync(path.join(__dirname, '../../api/swagger/swagger.yaml'), 'utf8')
    );
    app = express();
    app.use(express.json());
    app.use('/api', createRouter(spec, [path.join(__dirname, '../../api/controllers')]));
  });

  beforeEach(() => {
    sinon.stub(mongoose, 'model').throws(new Error('reached the database'));
    sinon.stub(MinioController, 'putDocument').rejects(new Error('reached object storage'));
  });

  afterEach(() => sinon.restore());

  it('does not route POST /public/comment', async () => {
    const res = await request(app).post('/api/public/comment').send({ period: OID, comment: 'text', author: 'A' });

    expect(res.status).to.equal(404);
    expect(mongoose.model.called, 'reached the database').to.be.false;
  });

  it('does not route POST /public/document', async () => {
    const res = await request(app).post('/api/public/document')
      .field('project', OID)
      .field('_comment', OID)
      .attach('upfile', Buffer.from('%PDF-1.4'), { filename: 'letter.pdf', contentType: 'application/pdf' });

    expect(res.status).to.equal(404);
    expect(mongoose.model.called, 'reached the database').to.be.false;
    expect(MinioController.putDocument.called, 'reached object storage').to.be.false;
  });
});
