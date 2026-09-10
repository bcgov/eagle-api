/**
 * The Content-Disposition filename on the staff open route.
 *
 * documentFileName is stored verbatim from the uploaded file name, including by the anonymous
 * /public/document route, so it can hold CR, LF and quotes. Node rejects those in a header value,
 * and the throw lands inside the handler's promise chain, i.e. a 500 on a document staff can list.
 * A real http.ServerResponse is used here on purpose: a stubbed setHeader would accept anything.
 */

const http = require('http');
const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const documentController = require('../../api/controllers/document');

const DOC_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const HOSTILE_NAME = 'evil\r\nX-Injected: yes"quoted".pdf';

const openArgs = () => ({
  swagger: {
    params: {
      docId: { value: DOC_ID },
      auth_payload: { realm_access: { roles: ['sysadmin'] }, preferred_username: 'tester', sub: 'kc-1' }
    }
  }
});

describe('document.protectedOpen Content-Disposition', () => {
  let res;

  beforeEach(() => {
    res = new http.ServerResponse(new http.IncomingMessage(null));

    sinon.stub(Utils, 'runDataQuery').resolves([
      { _id: DOC_ID, internalURL: 'p/a.pdf', documentFileName: HOSTILE_NAME, internalExt: 'pdf' }
    ]);
    sinon.stub(Utils, 'buildQuery').callsFake((prop, val, q) => { q[prop] = val; return q; });
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'getUrlAsStream').resolves({ pipe: sinon.stub() });
    sinon.stub(MinioController, 'statObject').resolves({ size: 10, metaData: { 'content-type': 'application/pdf' } });
    sinon.stub(MinioController, 'getPresignedGETUrl').resolves('https://minio.example/a.pdf');
    sinon.stub(mongoose, 'model').returns({ findById: () => Promise.resolve({ secureHitCount: 0, save: () => Promise.resolve() }) });
  });

  afterEach(() => sinon.restore());

  it('escapes CR, LF and quotes out of the stored file name instead of rejecting the response', async () => {
    // A rejection here is the bug: ERR_INVALID_CHAR out of setHeader reaches the error handler as a 500.
    await documentController.protectedOpen(openArgs(), res);

    const filename = /filename="(.*)"$/.exec(res.getHeader('Content-Disposition'))[1];
    expect(filename).to.not.match(/[\r\n"]/);
  });
});
