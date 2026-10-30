const { expect } = require('chai');
const sinon = require('sinon');
const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const YAML = require('js-yaml');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const auth = require('../../api/helpers/auth');
const createRouter = require('../../api/middleware/swagger-router');

describe('POST /api/login/token through the real router', () => {
  let app;
  let findOne;

  before(() => {
    const spec = YAML.load(fs.readFileSync(path.join(__dirname, '../../api/swagger/swagger.yaml'), 'utf8'));
    app = express();
    app.use(express.json());
    app.use('/api', createRouter({ paths: { '/login/token': spec.paths['/login/token'] } }, [path.join(__dirname, '../../api/controllers')]));
  });

  beforeEach(() => {
    const alice = { _id: 'u1', username: 'alice', password: 'right-pass', roles: ['staff'] };
    auth.setPassword(alice);
    findOne = sinon.stub().resolves(null);
    findOne.withArgs({ username: 'alice' }).resolves(alice);
    sinon.stub(mongoose, 'model').callThrough().withArgs('User').returns({ findOne });
  });

  afterEach(() => sinon.restore());

  it('answers 200 with a token naming the user and their roles for the right password', async () => {
    const res = await request(app).post('/api/login/token').send({ username: 'Alice', password: 'right-pass' });

    expect(res.status).to.equal(200);
    const claims = jwt.decode(res.body.accessToken);
    expect(claims.preferred_username).to.equal('alice');
    expect(claims.realm_access.roles).to.deep.equal(['staff']);
  });

  it('answers 400 saying the username or password is wrong', async () => {
    const res = await request(app).post('/api/login/token').send({ username: 'alice', password: 'wrong-pass' });

    expect(res.status).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'Invalid username or password' });
  });

  it('answers 400 without the database error text when the user lookup fails', async () => {
    findOne.withArgs({ username: 'alice' }).rejects(new Error('connect ECONNREFUSED 10.0.0.5:27017'));

    const res = await request(app).post('/api/login/token').send({ username: 'alice', password: 'right-pass' });

    expect(res.status).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'Login failed' });
  });
});
