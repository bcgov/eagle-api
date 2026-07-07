/**
 * Unit Tests for Project Redirect Middleware
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const projectRedirectMiddleware = require('../../api/middleware/projectRedirect');

describe('Project Redirect Middleware', () => {
  let sandbox;
  let middleware;
  let mockProjectModel;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    middleware = projectRedirectMiddleware();

    // Mock Mongoose model method
    mockProjectModel = {
      findById: sandbox.stub()
    };
    sandbox.stub(mongoose, 'model').withArgs('Project').returns(mockProjectModel);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should call next if path does not contain a legacy 24-character hex ID', async () => {
    const req = {
      path: '/api/project/some-non-hex-id',
      url: '/api/project/some-non-hex-id',
      method: 'GET'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    await middleware(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(res.redirect.called).to.be.false;
  });

  it('should redirect 301 for GET requests when legacy ID is found and has trackProjectId', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    const trackId = '12345';
    const req = {
      path: `/api/project/${legacyId}/details`,
      url: `/api/project/${legacyId}/details?foo=bar`,
      method: 'GET'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    const mockQuery = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves({ trackProjectId: trackId })
    };
    mockProjectModel.findById.withArgs(legacyId).returns(mockQuery);

    await middleware(req, res, next);

    expect(res.redirect.calledOnce).to.be.true;
    expect(res.redirect.calledWith(301, `/api/project/${trackId}/details?foo=bar`)).to.be.true;
    expect(next.called).to.be.false;
  });

  it('should transparently rewrite req.url for POST requests when legacy ID is found and has trackProjectId', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    const trackId = '12345';
    const req = {
      path: `/api/project/${legacyId}/details`,
      url: `/api/project/${legacyId}/details`,
      method: 'POST'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    const mockQuery = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves({ trackProjectId: trackId })
    };
    mockProjectModel.findById.withArgs(legacyId).returns(mockQuery);

    await middleware(req, res, next);

    expect(res.redirect.called).to.be.false;
    expect(req.url).to.equal(`/api/project/${trackId}/details`);
    expect(next.calledOnce).to.be.true;
  });

  it('should call next if project is not found in database', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    const req = {
      path: `/api/project/${legacyId}`,
      url: `/api/project/${legacyId}`,
      method: 'GET'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    const mockQuery = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves(null)
    };
    mockProjectModel.findById.withArgs(legacyId).returns(mockQuery);

    await middleware(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(res.redirect.called).to.be.false;
  });

  it('should call next if project has no trackProjectId', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    const req = {
      path: `/api/project/${legacyId}`,
      url: `/api/project/${legacyId}`,
      method: 'GET'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    const mockQuery = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves({ name: 'Test' })
    };
    mockProjectModel.findById.withArgs(legacyId).returns(mockQuery);

    await middleware(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(res.redirect.called).to.be.false;
  });

  it('should fail silently and call next when Mongoose query throws error', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    const req = {
      path: `/api/project/${legacyId}`,
      url: `/api/project/${legacyId}`,
      method: 'GET'
    };
    const res = {
      redirect: sandbox.spy()
    };
    const next = sandbox.spy();

    const mockQuery = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().rejects(new Error('Db Connection Error'))
    };
    mockProjectModel.findById.withArgs(legacyId).returns(mockQuery);

    await middleware(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(res.redirect.called).to.be.false;
  });
});
