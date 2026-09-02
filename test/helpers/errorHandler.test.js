/**
 * The app-wide Express error handler: a throwing route must log and answer a generic 500
 * instead of leaking Express' stack-trace page, while an error that already carries a client
 * status (body-parser's 400 and 413) keeps it.
 *
 * app.js is required here to prove the handler is actually mounted; NODE_ENV=test stops it
 * connecting to MongoDB or listening.
 */

process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const errorHandler = require('../../api/middleware/errorHandler');
const defaultLog = winston.loggers.get('default');

function buildApp(err) {
  const app = express();
  app.get('/boom', () => { throw (err || new Error('kaboom')); });
  app.use(errorHandler);
  return app;
}

describe('app error handler', () => {
  let errorStub;
  let warnStub;

  beforeEach(() => {
    errorStub = sinon.stub(defaultLog, 'error');
    warnStub = sinon.stub(defaultLog, 'warn');
  });
  afterEach(() => { sinon.restore(); });

  it('answers 500 with a generic JSON body and logs the error', async () => {
    const res = await request(buildApp()).get('/boom');

    expect(res.status).to.equal(500);
    expect(res.body).to.deep.equal({ message: 'Internal server error' });
    expect(errorStub.calledOnce).to.be.true;
    expect(errorStub.firstCall.args[0]).to.equal('GET /boom');
    expect(errorStub.firstCall.args[1].message).to.equal('kaboom');
    expect(errorStub.firstCall.args[1]).to.not.have.property('body');
  });

  it('logs only message and stack, never the raw error (body-parser sets err.body)', async () => {
    const err = new Error('Unexpected end of JSON input');
    err.status = 400;
    err.body = '{"password":"x"}';

    await request(buildApp(err)).get('/boom');

    expect(warnStub.calledOnce).to.be.true;
    const meta = warnStub.firstCall.args[1];
    expect(meta).to.deep.equal({ message: err.message, stack: err.stack });
    expect(meta).to.not.have.property('body');
  });

  it('keeps a 400 from err.status and answers with the error message, logged at warn', async () => {
    const err = new Error('Unexpected end of JSON input');
    err.status = 400;

    const res = await request(buildApp(err)).get('/boom');

    expect(res.status).to.equal(400);
    expect(res.body).to.deep.equal({ message: 'Unexpected end of JSON input' });
    expect(warnStub.calledOnce).to.be.true;
    expect(warnStub.firstCall.args[0]).to.equal('GET /boom 400');
    expect(warnStub.firstCall.args[1]).to.deep.equal({ message: err.message, stack: err.stack });
    expect(errorStub.called).to.be.false;
  });

  it('keeps a 413 from err.statusCode', async () => {
    const err = new Error('request entity too large');
    err.statusCode = 413;

    const res = await request(buildApp(err)).get('/boom');

    expect(res.status).to.equal(413);
    expect(res.body).to.deep.equal({ message: 'request entity too large' });
    expect(warnStub.calledOnce).to.be.true;
    expect(warnStub.firstCall.args[0]).to.equal('GET /boom 413');
    expect(warnStub.firstCall.args[1]).to.deep.equal({ message: err.message, stack: err.stack });
    expect(errorStub.called).to.be.false;
  });

  it('delegates instead of writing a second response once headers are sent', () => {
    const err = new Error('too late');
    const req = { method: 'GET', originalUrl: '/boom' };
    const res = { headersSent: true, status: sinon.spy(), json: sinon.spy() };
    const next = sinon.spy();

    errorHandler(err, req, res, next);

    expect(next.calledOnceWithExactly(err)).to.be.true;
    expect(res.status.called).to.be.false;
    expect(errorStub.calledOnce).to.be.true;
    expect(errorStub.firstCall.args[0]).to.equal('GET /boom');
    expect(errorStub.firstCall.args[1]).to.deep.equal({ message: err.message, stack: err.stack });
  });
});

describe('app.js mounts the error handler', () => {
  it('answers 400 JSON for a malformed JSON body instead of 500', async () => {
    const app = require('../../app');

    const res = await request(app)
      .post('/api/projects')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(res.status).to.equal(400);
    expect(res.body.message).to.be.a('string');
  });
});
