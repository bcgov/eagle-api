const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const demiPush = require('../../api/helpers/demiPush');
const documentController = require('../../api/controllers/document');

const DOC_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const PROJ_ID = '5f4c7d1e2b3a4c5d6e7f8092';

describe('document.featureDocument limit of five featured documents per project', () => {
  let document;
  let res;

  function withFeaturedCount(count) {
    const countDocuments = sinon.stub().resolves(count);
    sinon.stub(mongoose, 'model').callsFake(name => (name === 'Project'
      ? { findById: sinon.stub().resolves({ _id: PROJ_ID }) }
      : { findById: sinon.stub().resolves(document), countDocuments }));
    return countDocuments;
  }

  const args = () => ({ swagger: { params: { docId: { value: DOC_ID }, auth_payload: { realm_access: { roles: ['staff'] } } } } });

  beforeEach(() => {
    document = { _id: DOC_ID, project: PROJ_ID, isFeatured: false, save: sinon.stub().callsFake(() => Promise.resolve(document)) };
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    sinon.stub(demiPush, 'document').resolves();
  });

  afterEach(() => sinon.restore());

  it('features a fifth document', async () => {
    withFeaturedCount(4);

    await documentController.featureDocument(args(), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(document.save.calledOnce).to.be.true;
    expect(document.isFeatured).to.be.true;
  });

  it('refuses a sixth with 403 and leaves the document unfeatured', async () => {
    withFeaturedCount(5);

    await documentController.featureDocument(args(), res);

    expect(res.status.calledWith(403)).to.be.true;
    expect(res.json.firstCall.args[0]).to.include({ message: 'Feature document limit reached', limit: 5 });
    expect(document.save.called).to.be.false;
    expect(document.isFeatured).to.be.false;
  });

  it('counts only featured documents of the same project toward the limit', async () => {
    const countDocuments = withFeaturedCount(0);

    await documentController.featureDocument(args(), res);

    expect(countDocuments.firstCall.args[0]).to.deep.equal({ project: PROJ_ID, isFeatured: true });
  });
});
