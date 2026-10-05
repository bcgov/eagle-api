/**
 * Admin document upload (POST /document): images uploaded from the Update form (documentSource
 * 'UPDATE') must be a small web image; every other source keeps the old limits. Both admin and
 * public uploads record the sha256 of the uploaded bytes.
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const fs = require('fs');
const winston = require('winston');

const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const demiPush = require('../../api/helpers/demiPush');
const documentController = require('../../api/controllers/document');

const PROJECT_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const MB = 1024 * 1024;
// Known answer: sha256('abc'), so the test does not repeat the code under test.
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
// First bytes of each allowed image type; the upload check reads them.
const HEADERS = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'),
  'image/gif': Buffer.from('GIF89a', 'latin1')
};

describe('Document upload limits by source', () => {
  let res;
  let stored;

  function uploadArgs(documentSource, upfile, overrides = {}) {
    const params = {
      project: { value: PROJECT_ID },
      _comment: { value: null },
      upfile: { value: { buffer: HEADERS[upfile.mimetype] || Buffer.from('x'), ...upfile } },
      documentFileName: { value: upfile.originalname },
      documentSource: { value: documentSource },
      auth_payload: { preferred_username: 'staff-user' }
    };
    ['internalOriginalName', 'legislation', 'displayName', 'eaoStatus', 'publish', 'milestone', 'type',
      'documentAuthor', 'documentAuthorType', 'dateUploaded', 'datePosted', 'description', 'projectPhase']
      .forEach(name => { params[name] = { value: null }; });
    Object.entries(overrides).forEach(([name, value]) => { params[name] = { value }; });
    return { swagger: { params } };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    stored = null;
    function MockDocument() {
      this.save = () => { stored = this; return Promise.resolve(this); };
    }
    MockDocument.updateOne = () => Promise.resolve();
    sinon.stub(mongoose, 'model').returns(MockDocument);
    sinon.stub(MinioController, 'putDocument').resolves({ path: 'minio/file', extension: 'png' });
    sinon.stub(MinioController, 'deleteDocument').resolves();
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'unlinkSync');
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(demiPush, 'document').resolves();
    const log = winston.loggers.get('default');
    ['info', 'warn', 'error'].forEach(level => sinon.stub(log, level));
  });

  afterEach(() => sinon.restore());

  const rejected = {
    'a PDF': { mimetype: 'application/pdf', originalname: 'report.pdf', size: MB },
    'an SVG': { mimetype: 'image/svg+xml', originalname: 'map.svg', size: MB },
    'a PNG type on a .pdf name': { mimetype: 'image/png', originalname: 'report.pdf', size: MB },
    'a file with no name': { mimetype: 'image/png', originalname: '', size: MB }
  };

  Object.entries(rejected).forEach(([label, upfile]) => {
    it(`refuses ${label} as an Update image and stores nothing`, async () => {
      await documentController.protectedPost(uploadArgs('UPDATE', upfile), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(res.json.firstCall.args[0].message).to.equal('Update images must be JPEG, PNG, WebP or GIF files.');
      expect(MinioController.putDocument.called).to.be.false;
      expect(stored).to.be.null;
    });
  });

  const TYPE_ERROR = 'Update images must be JPEG, PNG, WebP or GIF files.';

  it('refuses a .png named PNG whose bytes are a JPEG', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/png', originalname: 'site.png', size: MB, buffer: HEADERS['image/jpeg'] }), res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.firstCall.args[0].message).to.equal(TYPE_ERROR);
    expect(stored).to.be.null;
  });

  it('refuses a WebP cut off before its WEBP marker instead of throwing', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/webp', originalname: 'site.webp', size: 11, buffer: Buffer.from('RIFF\0\0\0\0WEB', 'latin1') }), res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.firstCall.args[0].message).to.equal(TYPE_ERROR);
  });

  it('refuses an Update image whose documentFileName is not an image name', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/png', originalname: 'site.png', size: MB }, { documentFileName: 'report.pdf' }), res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.firstCall.args[0].message).to.equal(TYPE_ERROR);
  });

  it('refuses an Update image with no project and stores nothing', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/png', originalname: 'site.png', size: MB }, { project: null }), res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.firstCall.args[0].message).to.equal('Update images must be uploaded to a project.');
    expect(stored).to.be.null;
  });

  it('keeps an Update image private when the upload asks for eaoStatus Published', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/png', originalname: 'site.png', size: MB }, { eaoStatus: 'Published' }), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.read).to.not.include('public');
    expect(stored.eaoStatus).to.be.null;
  });

  it('keeps an Update image private when the upload asks for publish=true', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE',
      { mimetype: 'image/png', originalname: 'site.png', size: MB }, { publish: true }), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.read).to.not.include('public');
  });

  it('still publishes a project document uploaded with publish=true', async () => {
    await documentController.protectedPost(uploadArgs('PROJECT',
      { mimetype: 'application/pdf', originalname: 'report.pdf', size: MB }, { publish: true }), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.read).to.include('public');
  });

  it('refuses an Update image over 10MB', async () => {
    await documentController.protectedPost(uploadArgs('UPDATE', { mimetype: 'image/jpeg', originalname: 'site.jpg', size: 10 * MB + 1 }), res);

    expect(res.status.calledWith(400)).to.be.true;
    expect(res.json.firstCall.args[0].message).to.equal('Update images must be 10MB or smaller.');
    expect(stored).to.be.null;
  });

  [
    ['image/jpeg', 'site.JPG'],
    ['image/png', 'site.png'],
    ['image/webp', 'site.webp'],
    ['image/gif', 'site.gif']
  ].forEach(([mimetype, originalname]) => {
    it(`stores a 10MB ${mimetype} Update image, not public`, async () => {
      await documentController.protectedPost(uploadArgs('UPDATE', { mimetype, originalname, size: 10 * MB }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(stored.documentSource).to.equal('UPDATE');
      expect(stored.read).to.not.include('public');
    });
  });

  it('keeps the old limits for other sources: a 20MB PDF project document is stored', async () => {
    await documentController.protectedPost(uploadArgs('PROJECT', { mimetype: 'application/pdf', originalname: 'report.pdf', size: 20 * MB }), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.documentSource).to.equal('PROJECT');
  });

  it('records the sha256 of the bytes an admin uploads', async () => {
    await documentController.protectedPost(uploadArgs('PROJECT',
      { mimetype: 'application/pdf', originalname: 'report.pdf', size: 3, buffer: Buffer.from('abc') }), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.internalOriginalSha256).to.equal(ABC_SHA256);
  });

  it('records the sha256 of the bytes a member of the public uploads', async () => {
    const args = {
      swagger: { params: {
        project: { value: PROJECT_ID },
        _comment: { value: '5f4c7d1e2b3a4c5d6e7f8092' },
        upfile: { value: { mimetype: 'application/pdf', originalname: 'letter.pdf', size: 3, buffer: Buffer.from('abc') } }
      } },
      body: { documentAuthor: 'A. Person', documentAuthorType: '5f4c7d1e2b3a4c5d6e7f8093' }
    };

    await documentController.unProtectedPost(args, res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(stored.internalOriginalSha256).to.equal(ABC_SHA256);
  });
});
