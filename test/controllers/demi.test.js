/**
 * Unit Tests for DEMI Controller
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const demiController = require('../../api/controllers/demi');

describe('DEMI Controller Tests', () => {
  let findOneAndUpdateStub;

  beforeEach(() => {
    // Stub Mongoose findOneAndUpdate
    findOneAndUpdateStub = sinon.stub();
    sinon.stub(mongoose, 'model').withArgs('Document').returns({
      findOneAndUpdate: findOneAndUpdateStub
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 403 when API key is missing', async () => {
    const args = {
      headers: {},
      swagger: { params: { body: { value: {} } } }
    };

    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    };

    await demiController.syncDocumentFromDemi(args, res);

    expect(res.status.calledWith(403)).to.be.true;
    expect(res.json.calledWith(sinon.match({ message: 'Unauthorized.' }))).to.be.true;
  });

  it('should return 403 when API key is invalid', async () => {
    const args = {
      headers: { 'x-api-key': 'invalid-key' },
      swagger: { params: { body: { value: {} } } }
    };

    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    };

    await demiController.syncDocumentFromDemi(args, res);

    expect(res.status.calledWith(403)).to.be.true;
  });

  it('should return 400 when document body is missing', async () => {
    const args = {
      headers: { 'x-api-key': 'eagle-demi-api-key' },
      swagger: { params: { body: null } }
    };

    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    };

    await demiController.syncDocumentFromDemi(args, res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.calledWith(sinon.match({ message: 'Missing document data or _id.' }))).to.be.true;
  });

  it('should upsert document successfully when valid payload and API key provided', async () => {
    const docId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();
    const args = {
      headers: { 'x-api-key': 'eagle-demi-api-key' },
      swagger: {
        params: {
          body: {
            value: {
              _id: docId.toString(),
              project: projectId.toString(),
              displayName: 'test-doc.pdf',
              s3Key: 'test/path/test-doc.pdf',
              isPublished: true,
              contentExtracted: true,
              contentPageCount: 5
            }
          }
        }
      }
    };

    const res = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis()
    };

    findOneAndUpdateStub.resolves({ _id: docId });

    await demiController.syncDocumentFromDemi(args, res);

    expect(findOneAndUpdateStub.calledOnce).to.be.true;
    const [query, update, options] = findOneAndUpdateStub.firstCall.args;
    expect(query._id.toString()).to.equal(docId.toString());
    expect(update.$set.displayName).to.equal('test-doc.pdf');
    expect(update.$set.read).to.include('public');
    expect(options.upsert).to.be.true;

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith(sinon.match({ message: 'Cached successfully', docId: docId.toString() }))).to.be.true;
  });
});
