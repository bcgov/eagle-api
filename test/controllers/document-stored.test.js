// POST /document/stored: DEMI registers an object already in the bucket under the id it minted.
// The object is never written or removed, so putDocument and deleteObject must stay untouched.

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');

const Utils = require('../../api/helpers/utils');
const MinioController = require('../../api/helpers/minio');
const Document = require('../../api/helpers/models/document');
const Project = require('../../api/helpers/models/project');
const List = require('../../api/helpers/models/list');
const documentController = require('../../api/controllers/document');
const { OID, DEMI_ON, p, auth, setEnv } = require('../support/demiPushHarness');

const SENT_ID = '5f4c7d1e2b3a4c5d6e7f81a1';
const LIST_ID = '5f4c7d1e2b3a4c5d6e7f81b2';
const KEY = `${OID}/report.pdf`;
const STAFF_ONLY = ['sysadmin', 'staff'];

describe('Document create for a stored object', () => {
  let res, rows, nextSaveError, sameProjectRows, fetch, restoreEnv;

  const body = (overrides = {}) => ({
    _id: SENT_ID, project: OID, internalURL: KEY, documentFileName: 'report.pdf', internalExt: 'pdf', ...overrides
  });
  const post = async (sent) => {
    await documentController.protectedPostStored({ swagger: { params: { document: p(sent), auth_payload: auth } } }, res);
    return res.status.lastCall.args[0];
  };
  const reply = () => res.json.lastCall.args[0];
  const pushedDoc = () => JSON.parse(fetch.firstCall.args[1].body).doc;
  const expectObjectUntouched = () => {
    expect(MinioController.putDocument.called, 'putDocument called').to.be.false;
    expect(MinioController.deleteObject.called, 'deleteObject called').to.be.false;
  };

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    rows = new Map();
    nextSaveError = null;
    sinon.stub(Document.prototype, 'save').callsFake(function () {
      const id = String(this._id);
      if (nextSaveError) {
        return Promise.reject(nextSaveError);
      }
      if (rows.has(id)) {
        return Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { _id: 1 } }));
      }
      rows.set(id, this);
      return Promise.resolve(this);
    });
    sameProjectRows = [];
    const query = { collation: () => query, select: () => query, lean: () => Promise.resolve(sameProjectRows) };
    sinon.stub(Document, 'find').returns(query);
    sinon.stub(Project, 'exists').resolves({ _id: OID });
    // demiPush caches the List read for the process; with no connection mongoose would buffer it forever.
    sinon.stub(List, 'find').returns({ lean: () => Promise.resolve([]) });
    sinon.stub(MinioController, 'statObject').resolves({ size: 2048, metaData: { 'content-type': 'application/pdf' } });
    sinon.stub(MinioController, 'putDocument').rejects(new Error('upload not allowed'));
    sinon.stub(MinioController, 'deleteObject').rejects(new Error('delete not allowed'));
    sinon.stub(Utils, 'recordAction').resolves();
    fetch = sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    restoreEnv = setEnv(DEMI_ON);
    const log = winston.loggers.get('default');
    ['info', 'warn', 'error'].forEach(level => sinon.stub(log, level));
  });

  afterEach(() => {
    sinon.restore();
    restoreEnv();
  });

  it('saves the record under the sent _id, staff-only, with size and type from the bucket, and pushes it', async () => {
    expect(await post(body())).to.equal(200);

    const saved = rows.get(SENT_ID);
    expect(saved.internalURL).to.equal(KEY);
    expect(saved.internalSize).to.equal('2048');
    expect(saved.internalMime).to.equal('application/pdf');
    expect([...saved.read]).to.have.members(STAFF_ONLY);
    expect([...saved.write]).to.have.members(STAFF_ONLY);
    expect([...saved.delete]).to.have.members(STAFF_ONLY);
    expect(saved.eaoStatus).to.equal(null);
    expect(saved.passedAVCheck).to.equal(false);
    expect(saved.legislation).to.equal(null);
    expect(MinioController.statObject.firstCall.args[1]).to.equal(KEY);
    expect(pushedDoc()._id).to.equal(SENT_ID);
    expectObjectUntouched();
  });

  it('copies the descriptive fields from the body', async () => {
    const datePosted = '2026-10-01T00:00:00.000Z';
    const dateUploaded = '2026-10-02T00:00:00.000Z';
    await post(body({
      displayName: 'Final report', description: 'Annual', documentAuthor: 'Acme', datePosted, dateUploaded,
      sortOrder: 3, legislation: '2018', milestone: LIST_ID
    }));

    const saved = rows.get(SENT_ID);
    expect(saved.displayName).to.equal('Final report');
    expect(saved.description).to.equal('Annual');
    expect(saved.documentAuthor).to.equal('Acme');
    expect(saved.datePosted.toISOString()).to.equal(datePosted);
    expect(saved.dateUploaded.toISOString()).to.equal(dateUploaded);
    expect(saved.sortOrder).to.equal(3);
    expect(saved.legislation).to.equal(2018);
    expect(String(saved.milestone)).to.equal(LIST_ID);
    expectObjectUntouched();
  });

  [true, 'true'].forEach(value => {
    it(`records passedAVCheck for ${JSON.stringify(value)}`, async () => {
      await post(body({ passedAVCheck: value }));

      expect(rows.get(SENT_ID).passedAVCheck).to.equal(true);
    });
  });

  it('stores null for an optional id sent as the string "null"', async () => {
    expect(await post(body({ milestone: 'null' }))).to.equal(200);

    expect(rows.get(SENT_ID).milestone).to.equal(null);
  });

  it('answers 409 to a second create with the same _id and pushes nothing more', async () => {
    await post(body());

    expect(await post(body())).to.equal(409);
    expect(fetch.callCount).to.equal(1);
    expectObjectUntouched();
  });

  it('answers 409 with the existing id and saves nothing when a document of the project already points at the object', async () => {
    sameProjectRows.push({ _id: LIST_ID, internalURL: KEY });

    expect(await post(body())).to.equal(409);
    expect(reply()._id).to.equal(LIST_ID);
    expect(rows.size).to.equal(0);
    expect(Document.find.firstCall.args[0]).to.deep.equal({ _schemaName: 'Document', project: OID, internalURL: KEY });
    expectObjectUntouched();
  });

  // The collated query matches case-insensitively; a key differing only in case is another object.
  it('saves when the only match differs from the key in case', async () => {
    sameProjectRows.push({ _id: LIST_ID, internalURL: KEY.toUpperCase() });

    expect(await post(body())).to.equal(200);
  });

  it('answers 400 and saves nothing when the object is not in the bucket', async () => {
    MinioController.statObject.rejects(Object.assign(new Error('Not Found'), { code: 'NotFound' }));

    expect(await post(body())).to.equal(400);
    expect(rows.size).to.equal(0);
    expectObjectUntouched();
  });

  it('answers 400 and saves nothing when the stat resolves with no object', async () => {
    MinioController.statObject.resolves(undefined);

    expect(await post(body())).to.equal(400);
    expect(rows.size).to.equal(0);
  });

  it('answers 503 and saves nothing when the bucket cannot be read', async () => {
    MinioController.statObject.rejects(Object.assign(new Error('Access Denied'), { code: 'AccessDenied' }));

    expect(await post(body())).to.equal(503);
    expect(reply()).to.have.property('message');
    expect(rows.size).to.equal(0);
  });

  it('answers 400 and saves nothing when project names no Project', async () => {
    Project.exists.resolves(null);

    expect(await post(body())).to.equal(400);
    expect(rows.size).to.equal(0);
    expect(Project.exists.firstCall.args[0]).to.deep.equal({ _id: OID, _schemaName: 'Project' });
  });

  ['internalURL', 'documentFileName', 'internalExt'].forEach(name => {
    [undefined, ' '].forEach(value => {
      it(`answers 400 and saves nothing when ${name} is ${JSON.stringify(value)}`, async () => {
        expect(await post(body({ [name]: value }))).to.equal(400);
        expect(rows.size).to.equal(0);
      });
    });
  });

  [['project', 'abc'], ['milestone', 'abc']].forEach(([name, value]) => {
    it(`answers 400 and saves nothing when ${name} is not an id`, async () => {
      expect(await post(body({ [name]: value }))).to.equal(400);
      expect(rows.size).to.equal(0);
    });
  });

  // An _id is never generated here: DEMI already stored it as the row's Eagle id.
  [undefined, '', 'abc'].forEach(value => {
    it(`answers 400 and saves nothing for _id ${JSON.stringify(value)}`, async () => {
      expect(await post(body({ _id: value }))).to.equal(400);
      expect(rows.size).to.equal(0);
    });
  });

  it('answers 400 with only the message when the record fails validation', async () => {
    nextSaveError = new mongoose.Error.ValidationError();

    expect(await post(body())).to.equal(400);
    expect(Object.keys(reply())).to.deep.equal(['message']);
  });

  it('answers 500 with only a message when the save fails for another reason', async () => {
    nextSaveError = new Error('connection reset');

    expect(await post(body())).to.equal(500);
    expect(Object.keys(reply())).to.deep.equal(['message']);
    expect(fetch.called).to.be.false;
    expect(winston.loggers.get('default').error.called).to.be.true;
  });
});
