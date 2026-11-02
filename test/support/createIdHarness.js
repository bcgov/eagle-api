const { expect } = require('chai');
const sinon = require('sinon');
const Utils = require('../../api/helpers/utils');
const { DEMI_ON, setEnv } = require('./demiPushHarness');
const SENT_ID = '5f4c7d1e2b3a4c5d6e7f81a1';

const duplicateKey = (key, value) => Object.assign(
  new Error(`E11000 duplicate key error dup key: { ${key}: ${value} }`), { code: 11000, keyPattern: { [key]: 1 } });

// The `_id` cases a create handler owes DEMI, against a real model whose save keeps `_id` unique as
// Mongo does. `post(_id)` sends one create and resolves the status; a caller's own stubs are replaced.
function itHonoursCreateId(Model, post) {
  let sandbox, rows, fetch, restoreEnv, nextSaveError;
  const pushedDoc = () => JSON.parse(fetch.firstCall.args[1].body).doc;

  beforeEach(() => {
    [Model.prototype.save, Utils.recordAction].forEach(fn => fn.restore && fn.restore());
    sandbox = sinon.createSandbox();
    sandbox.stub(Utils, 'recordAction').resolves();
    rows = new Map();
    nextSaveError = null;
    sandbox.stub(Model.prototype, 'save').callsFake(function () {
      const id = String(this._id);
      if (nextSaveError) {
        return Promise.reject(nextSaveError);
      }
      if (rows.has(id)) {
        return Promise.reject(duplicateKey('_id', id));
      }
      rows.set(id, this);
      return Promise.resolve(this);
    });
    fetch = sandbox.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    restoreEnv = setEnv(DEMI_ON);
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('creates the row under a sent 24-hex _id and pushes that id to DEMI', async () => {
    expect(await post(SENT_ID)).to.equal(200);
    expect([...rows.keys()]).to.deep.equal([SENT_ID]);
    expect(pushedDoc()._id).to.equal(SENT_ID);
  });

  it('answers 409 to a second create with the same _id and saves, pushes and records nothing more', async () => {
    await post(SENT_ID);
    expect(await post(SENT_ID)).to.equal(409);
    expect(rows.size).to.equal(1);
    expect(fetch.callCount).to.equal(1);
    expect(Utils.recordAction.callCount).to.equal(1);
  });

  [null, ''].forEach(value => {
    it(`generates the id when _id is ${JSON.stringify(value)}`, async () => {
      expect(await post(value)).to.equal(200);
      const [id] = rows.keys();
      expect(id).to.match(/^[0-9a-f]{24}$/);
      expect(pushedDoc()._id).to.equal(id);
    });
  });

  it('answers 400, not 409, to a duplicate on a key other than _id', async () => {
    nextSaveError = duplicateKey('trackProjectId', 7);
    expect(await post(SENT_ID)).to.equal(400);
    expect(fetch.called).to.be.false;
  });

  // bson's ObjectId.isValid passes 12 characters and a number; uppercase would echo back changed.
  ['abc', 'abcdefghijkl', 123, SENT_ID.toUpperCase()].forEach(value => {
    it(`answers 400 and saves nothing for _id ${JSON.stringify(value)}`, async () => {
      expect(await post(value)).to.equal(400);
      expect(rows.size).to.equal(0);
      expect(fetch.called).to.be.false;
    });
  });
}

module.exports = { itHonoursCreateId };
