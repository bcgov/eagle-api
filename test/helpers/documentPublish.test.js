const { expect } = require('chai');
const sinon = require('sinon');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');
const documentPublish = require('../../api/helpers/documentPublish');

describe('documentPublish hands its DEMI push to the caller', () => {
  let document, written, push;

  beforeEach(() => {
    document = { _id: 'doc-1', project: 'proj-1', save: sinon.stub().resolves({ _id: 'doc-1' }) };
    written = { _id: 'doc-1', read: ['public'] };
    push = Promise.resolve(true);
    sinon.stub(Utils, 'recordAction');
    sinon.stub(Actions, 'publish').resolves(written);
    sinon.stub(Actions, 'unPublish').resolves(written);
    sinon.stub(demiPush, 'document').returns(push);
  });

  afterEach(() => sinon.restore());

  it('publish puts the push of the published document on pushes', async () => {
    const pushes = [];

    await documentPublish.publish(document, 'tester', null, pushes);

    expect(pushes).to.have.lengthOf(1);
    expect(pushes[0]).to.equal(push);
    expect(demiPush.document.calledOnceWithExactly(written)).to.be.true;
  });

  it('unPublish puts the push of the unpublished document on pushes', async () => {
    const pushes = [];

    await documentPublish.unPublish(document, 'tester', null, 'Rejected', pushes);

    expect(pushes).to.have.lengthOf(1);
    expect(pushes[0]).to.equal(push);
    expect(demiPush.document.calledOnceWithExactly(written)).to.be.true;
  });

  it('publish without pushes still mirrors and returns the published document', async () => {
    const published = await documentPublish.publish(document, 'tester');

    expect(published).to.equal(written);
    expect(demiPush.document.calledOnceWithExactly(written)).to.be.true;
  });
});
