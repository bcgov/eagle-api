/**
 * The app-wide Express error handler: a throwing route must log and answer a generic 500
 * instead of leaking Express' stack-trace page.
 */

const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const errorHandler = require('../../api/middleware/errorHandler');
const defaultLog = winston.loggers.get('default');

function buildApp() {
  const app = express();
  app.get('/boom', () => { throw new Error('kaboom'); });
  app.use(errorHandler);
  return app;
}

describe('app error handler', () => {
  let errorStub;

  beforeEach(() => { errorStub = sinon.stub(defaultLog, 'error'); });
  afterEach(() => { sinon.restore(); });

  it('answers 500 with a generic JSON body and logs the error', async () => {
    const res = await request(buildApp()).get('/boom');

    expect(res.status).to.equal(500);
    expect(res.body).to.deep.equal({ message: 'Internal server error' });
    expect(errorStub.calledOnce).to.be.true;
    expect(errorStub.firstCall.args[0].message).to.equal('kaboom');
  });

  it('delegates instead of writing a second response once headers are sent', () => {
    const err = new Error('too late');
    const res = { headersSent: true, status: sinon.spy(), json: sinon.spy() };
    const next = sinon.spy();

    errorHandler(err, {}, res, next);

    expect(next.calledOnceWithExactly(err)).to.be.true;
    expect(res.status.called).to.be.false;
    expect(errorStub.calledOnce).to.be.true;
  });
});
