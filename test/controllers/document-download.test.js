const http = require('http');
const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const analytics = require('../../api/helpers/analytics');
const documentController = require('../../api/controllers/document');

const DOC_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const auth_payload = { realm_access: { roles: ['sysadmin'] }, preferred_username: 'tester', sub: 'kc-1' };
const downloadArgs = () => ({ swagger: { params: { docId: { value: DOC_ID }, auth_payload } } });

// A stored file served inline under its own type would run as a page on the API origin.
describe('document download Content-Type and Content-Disposition', () => {
  let res;

  function storedAs(contentType, documentFileName, internalExt) {
    sinon.stub(Utils, 'runDataQuery').resolves([{ _id: DOC_ID, internalURL: 'p/f', documentFileName, internalExt }]);
    sinon.stub(MinioController, 'statObject').resolves({ size: 10, metaData: { 'content-type': contentType } });
  }

  beforeEach(() => {
    res = new http.ServerResponse(new http.IncomingMessage(null));
    sinon.stub(Utils, 'buildQuery').callsFake((prop, val, q) => { q[prop] = val; return q; });
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'getUrlAsStream').resolves({ pipe: sinon.stub() });
    sinon.stub(analytics, 'trackEvent');
    sinon.stub(MinioController, 'getPresignedGETUrl').resolves('https://minio.example/f');
    sinon.stub(mongoose, 'model').returns({ findById: () => Promise.resolve({ save: () => Promise.resolve() }) });
  });

  afterEach(() => sinon.restore());

  ['publicDownload', 'protectedOpen'].forEach(handler => {
    it(`${handler} sends a stored text/html file as an octet-stream attachment`, async () => {
      storedAs('text/html', 'page.html', 'html');

      await documentController[handler](downloadArgs(), res);

      expect(res.getHeader('Content-Type')).to.equal('application/octet-stream');
      expect(res.getHeader('Content-Disposition')).to.equal('attachment;filename="page.html"');
    });

    it(`${handler} sends a stored PDF inline as application/pdf`, async () => {
      storedAs('application/pdf', 'report.pdf', 'pdf');

      await documentController[handler](downloadArgs(), res);

      expect(res.getHeader('Content-Type')).to.equal('application/pdf');
      expect(res.getHeader('Content-Disposition')).to.equal('inline;filename="report.pdf"');
    });
  });

  it('protectedDownload sends a stored text/html file as an attachment', async () => {
    storedAs('text/html', 'page.html', 'html');

    await documentController.protectedDownload(downloadArgs(), res);

    expect(res.getHeader('Content-Disposition')).to.equal('attachment;filename="page.html"');
  });
});
