/**
 * Unit Tests for API Helpers - DEMI Push
 *
 * Testing the dark outbound mirror to demi-api
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');

const DEMI_PUSH_PATH = require.resolve('../../api/helpers/demiPush');
const defaultLog = winston.loggers.get('default');

const BASE = 'https://demi-apim-test.example/machine';
const okResponse = () => ({ ok: true, status: 200 });
const failResponse = status => ({ ok: false, status });

const REGULATION = '5f4c7d1e2b3a4c5d6e7f0001';
const PROPONENT = '5f4c7d1e2b3a4c5d6e7f0002';
const PIN_A = '5f4c7d1e2b3a4c5d6e7f0003';
const PIN_B = '5f4c7d1e2b3a4c5d6e7f0004';
const PHASE = '5f4c7d1e2b3a4c5d6e7f0006';
const PAST_PHASE = '5f4c7d1e2b3a4c5d6e7f0007';
const DECISION = '5f4c7d1e2b3a4c5d6e7f0008';
const CEAA = '5f4c7d1e2b3a4c5d6e7f0009';
const GONE = '5f4c7d1e2b3a4c5d6e7f000a';
const ZERO_LEG_PHASE = '5f4c7d1e2b3a4c5d6e7f000b';

const LISTS = [
  { _id: REGULATION, name: 'Reviewable Projects Regulation', item: 'https://www.bclaws.ca/rpr' },
  { _id: PAST_PHASE, name: 'Pre-Application', type: 'projectPhase', legislation: 2002 },
  { _id: ZERO_LEG_PHASE, name: 'Unassigned Phase', type: 'projectPhase', legislation: 0 },
  { _id: PHASE, name: 'Application Review', type: 'projectPhase', legislation: 2002 },
  { _id: DECISION, name: 'Certificate Issued', type: 'eaDecisions', legislation: 2002 },
  { _id: CEAA, name: 'Substituted', type: 'ceaaInvolvements', legislation: 2002 }
];
const ORGS = [
  { _id: PROPONENT, name: 'Acme Mining', province: 'BC' },
  { _id: PIN_A, name: 'First Nation A', province: 'BC' },
  { _id: PIN_B, name: 'First Nation B', province: 'AB' }
];

// Kinds that push the stored document as it stands: [export name, DEMI route segment]
const MIRRORED = [
  ['commentPeriod', 'commentperiods'],
  ['comment', 'comments'],
  ['organization', 'organizations'],
  ['projectNotification', 'notifications']
];

const PERIOD = '5f4c7d1e2b3a4c5d6e7f0005';

// Every field eagle-public reads off a published comment. No email: the Comment model has none.
const commentDoc = () => ({
  _id: 'c1',
  _schemaName: 'Comment',
  author: 'Jane Public',
  comment: 'Body text',
  commentId: 7,
  dateAdded: '2026-09-01T00:00:00.000Z',
  documents: ['doc-1'],
  eaoStatus: 'Published',
  isAnonymous: false,
  period: PERIOD,
  read: ['public', 'staff', 'sysadmin']
});

const projectDoc = () => ({
  _id: 'p1',
  currentLegislationYear: 'legislation_2002',
  pinsRead: ['public'],
  pins: [PIN_A, PIN_B],
  featuredDocuments: ['doc-1', 'doc-2'],
  legislation_2002: { name: 'Test', proponent: PROPONENT, applicableRegulation: REGULATION }
});

describe('DemiPush Helper', () => {
  let fetchStub;
  let errorStub;
  let warnStub;
  let originalBase;
  let originalKey;
  let demiPush;

  // The List map is memoized for the life of the module, so each test gets a fresh copy of it.
  beforeEach(() => {
    delete require.cache[DEMI_PUSH_PATH];
    demiPush = require(DEMI_PUSH_PATH);
    originalBase = process.env.DEMI_API_BASE;
    originalKey = process.env.DEMI_APIM_KEY;
    fetchStub = sinon.stub(global, 'fetch');
    errorStub = sinon.stub(defaultLog, 'error');
    warnStub = sinon.stub(defaultLog, 'warn');
  });

  function stubModels(lists, orgs) {
    const listFind = sinon.stub().returns({ lean: () => Promise.resolve(lists) });
    const orgFind = sinon.stub().returns({ lean: () => Promise.resolve(orgs) });
    const model = sinon.stub(mongoose, 'model');
    model.withArgs('List').returns({ find: listFind });
    model.withArgs('Organization').returns({ find: orgFind });
    return { listFind, orgFind };
  }

  const pushedDoc = () => JSON.parse(fetchStub.firstCall.args[1].body).doc;

  afterEach(() => {
    sinon.restore();
    if (originalBase === undefined) { delete process.env.DEMI_API_BASE; } else { process.env.DEMI_API_BASE = originalBase; }
    if (originalKey === undefined) { delete process.env.DEMI_APIM_KEY; } else { process.env.DEMI_APIM_KEY = originalKey; }
  });

  describe('dark by default', () => {
    it('should not call fetch when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      // Nothing to send is not a failure: a caller that counts results must not see this as one.
      expect(await demiPush.project({ _id: 'p1', name: 'Test' })).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should not call fetch for documents when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      expect(await demiPush.document({ _id: 'd1' })).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should not call fetch for the config when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      expect(await demiPush.config({ ENVIRONMENT: 'test' })).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should not call fetch for Updates when DEMI_API_BASE is unset', async () => {
      delete process.env.DEMI_API_BASE;
      expect(await demiPush.recentActivity({ _id: 'u1' })).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    MIRRORED.forEach(([kind]) => {
      it(`should not call fetch for ${kind} when DEMI_API_BASE is unset`, async () => {
        delete process.env.DEMI_API_BASE;
        await demiPush[kind]({ _id: 'x1' });
        expect(fetchStub.called).to.be.false;
      });
    });

    it('should stay dark and warn once per process when DEMI_APIM_KEY is unset', async () => {
      process.env.DEMI_API_BASE = BASE;
      delete process.env.DEMI_APIM_KEY;

      await demiPush.project({ _id: 'p1' });
      await demiPush.project({ _id: 'p2' });

      expect(fetchStub.called).to.be.false;
      expect(warnStub.calledOnceWith('[demiPush] DEMI_APIM_KEY unset — pushes disabled')).to.be.true;
    });
  });

  describe('when DEMI_API_BASE is set', () => {
    beforeEach(() => {
      process.env.DEMI_API_BASE = BASE;
      process.env.DEMI_APIM_KEY = 'test-key';
    });

    it('should PUT to the APIM eagle project route with the subscription key', async () => {
      fetchStub.resolves(okResponse());
      const landed = await demiPush.project({ _id: 'p1', name: 'Test' });

      expect(landed).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      // APIM's backend supplies /api, so a second one here would 404
      expect(url).to.equal(`${BASE}/eagle/projects/p1`);
      expect(options.method).to.equal('PUT');
      expect(options.headers).to.deep.equal({
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': 'test-key'
      });
      expect(JSON.parse(options.body)).to.deep.equal({ doc: { _id: 'p1', name: 'Test' } });
      expect(errorStub.called).to.be.false;
    });

    it('should resolve false and log once when fetch throws', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      const landed = await demiPush.project({ _id: 'p1' });

      expect(landed).to.be.false;
      expect(errorStub.calledOnce).to.be.true;
      const [message, meta] = errorStub.firstCall.args;
      expect(message).to.equal('[demiPush] projects p1 failed');
      expect(meta.error).to.equal('ECONNREFUSED');
      expect(meta.stack).to.be.a('string');
    });

    it('should retry once on a 5xx', async () => {
      fetchStub.resolves(failResponse(500));
      const landed = await demiPush.project({ _id: 'p1' });

      expect(landed).to.be.false;
      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.calledOnceWith('[demiPush] projects p1 rejected 500')).to.be.true;
    });

    it('should not retry on a 4xx', async () => {
      fetchStub.resolves(failResponse(404));
      const landed = await demiPush.project({ _id: 'p1' });

      expect(landed).to.be.false;
      expect(fetchStub.callCount).to.equal(1);
      expect(errorStub.calledOnceWith('[demiPush] projects p1 rejected 404')).to.be.true;
    });


    it('should resolve regulation, proponent and pins into the project body', async () => {
      const { listFind, orgFind } = stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());

      await demiPush.project(projectDoc());

      expect(fetchStub.calledOnce).to.be.true;
      expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/projects/p1`);
      expect(listFind.calledOnceWithExactly({ _schemaName: 'List' }, '_id name item type legislation')).to.be.true;
      // pins and proponent resolve in one Organization read
      expect(orgFind.calledOnceWithExactly(
        { _id: { $in: [PIN_A, PIN_B, PROPONENT] } },
        '_id name province'
      )).to.be.true;

      const doc = pushedDoc();
      expect(doc.legislation_2002.applicableRegulation).to.deep.equal({
        _id: REGULATION,
        name: 'Reviewable Projects Regulation',
        item: 'https://www.bclaws.ca/rpr'
      });
      expect(doc.legislation_2002.proponentId).to.equal(PROPONENT);
      expect(doc.legislation_2002.proponentName).to.equal('Acme Mining');
      expect(doc.pins).to.deep.equal([
        { _id: PIN_A, name: 'First Nation A', province: 'BC' },
        { _id: PIN_B, name: 'First Nation B', province: 'AB' }
      ]);
      expect(doc.featuredDocuments).to.deep.equal(['doc-1', 'doc-2']);
      // untouched fields survive
      expect(doc.pinsRead).to.deep.equal(['public']);
      expect(doc.legislation_2002.name).to.equal('Test');
      expect(errorStub.called).to.be.false;
    });

    it('should keep an already-populated applicableRegulation as it stands', async () => {
      stubModels([], ORGS);
      fetchStub.resolves(okResponse());
      const populated = { _id: REGULATION, name: 'Already Here', item: 'https://example.test/reg' };
      const project = projectDoc();
      project.legislation_2002.applicableRegulation = populated;

      await demiPush.project(project);

      expect(pushedDoc().legislation_2002.applicableRegulation).to.deep.equal(populated);
    });

    it('should resolve phase, decision and involvement refs into List objects', async () => {
      const { listFind } = stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.currentPhaseName = PHASE;
      project.legislation_2002.eacDecision = DECISION;
      project.legislation_2002.CEAAInvolvement = CEAA;

      const landed = await demiPush.project(project);

      expect(landed).to.be.true;
      // one read covers every List ref on the push
      expect(listFind.calledOnce).to.be.true;

      const block = pushedDoc().legislation_2002;
      // eagle-public picks its stage rail off the phase's own type and legislation year
      expect(block.currentPhaseName).to.deep.equal({
        _id: PHASE, name: 'Application Review', type: 'projectPhase', legislation: 2002
      });
      expect(block.eacDecision).to.deep.equal({
        _id: DECISION, name: 'Certificate Issued', type: 'eaDecisions', legislation: 2002
      });
      expect(block.CEAAInvolvement).to.deep.equal({
        _id: CEAA, name: 'Substituted', type: 'ceaaInvolvements', legislation: 2002
      });
      expect(warnStub.called).to.be.false;
    });

    it('should carry a List row with legislation 0 as 0, not null', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.currentPhaseName = ZERO_LEG_PHASE;

      await demiPush.project(project);

      expect(pushedDoc().legislation_2002.currentPhaseName).to.deep.equal({
        _id: ZERO_LEG_PHASE, name: 'Unassigned Phase', type: 'projectPhase', legislation: 0
      });
    });

    it('should resolve every phaseHistory entry and leave a populated one alone', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const populated = { _id: PAST_PHASE, name: 'Already Here', type: 'projectPhase', legislation: 1996 };
      const project = projectDoc();
      project.legislation_2002.phaseHistory = [populated, PHASE];

      await demiPush.project(project);

      expect(pushedDoc().legislation_2002.phaseHistory).to.deep.equal([
        populated,
        { _id: PHASE, name: 'Application Review', type: 'projectPhase', legislation: 2002 }
      ]);
      // a ref that arrived populated is not an unresolved one
      expect(warnStub.called).to.be.false;
    });

    it('should keep an already-populated currentPhaseName as it stands', async () => {
      stubModels([], ORGS);
      fetchStub.resolves(okResponse());
      const populated = { _id: PHASE, name: 'Already Here', type: 'projectPhase', legislation: 2002 };
      const project = projectDoc();
      project.legislation_2002.currentPhaseName = populated;

      await demiPush.project(project);

      expect(pushedDoc().legislation_2002.currentPhaseName).to.deep.equal(populated);
      expect(warnStub.called).to.be.false;
    });

    it('should pass an id with no List row through unchanged and warn once', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.currentPhaseName = GONE;
      project.legislation_2002.phaseHistory = [GONE, PHASE];

      const landed = await demiPush.project(project);

      expect(landed).to.be.true;
      const block = pushedDoc().legislation_2002;
      // a stale ref still reaches DEMI, so the reconcile can see it
      expect(block.currentPhaseName).to.equal(GONE);
      expect(block.phaseHistory[0]).to.equal(GONE);
      expect(block.phaseHistory[1].name).to.equal('Application Review');
      // one line for the push, whatever how many refs missed
      expect(warnStub.calledOnce).to.be.true;
      expect(warnStub.firstCall.args[0]).to.equal('[demiPush] project p1: List ids not found, pushed as ids');
      expect(warnStub.firstCall.args[1]).to.deep.equal({ ids: [GONE] });
      expect(errorStub.called).to.be.false;
    });

    it('should read the List collection for a phase even when no regulation is set', async () => {
      const { listFind } = stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.applicableRegulation = null;
      project.legislation_2002.currentPhaseName = PHASE;

      await demiPush.project(project);

      expect(listFind.calledOnce).to.be.true;
      expect(pushedDoc().legislation_2002.currentPhaseName.name).to.equal('Application Review');
    });

    it('should not mutate the phase refs on the project it was handed', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.currentPhaseName = PHASE;
      project.legislation_2002.phaseHistory = [PHASE];

      await demiPush.project(project);

      expect(project.legislation_2002.currentPhaseName).to.equal(PHASE);
      expect(project.legislation_2002.phaseHistory).to.deep.equal([PHASE]);
    });

    it('should leave a null proponent, regulation and pin out of the lookups', async () => {
      const { listFind, orgFind } = stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.legislation_2002.proponent = null;
      project.legislation_2002.applicableRegulation = null;
      project.pins = [null, PIN_A];

      await demiPush.project(project);

      // a null id must not reach Mongo as the string 'null', which casts to an error
      expect(listFind.called).to.be.false;
      expect(orgFind.calledOnceWithExactly({ _id: { $in: [PIN_A] } }, '_id name province')).to.be.true;

      const doc = pushedDoc();
      expect(doc.legislation_2002.applicableRegulation).to.equal(null);
      expect(doc.legislation_2002.proponentId).to.equal(null);
      expect(doc.legislation_2002.proponentName).to.equal(null);
      expect(doc.pins).to.deep.equal([{ _id: PIN_A, name: 'First Nation A', province: 'BC' }]);
      expect(errorStub.called).to.be.false;
    });

    it('should drop a pin whose organization is gone and null a missing regulation', async () => {
      stubModels([], [{ _id: PIN_B, name: 'First Nation B', province: 'AB' }]);
      fetchStub.resolves(okResponse());

      await demiPush.project(projectDoc());

      const doc = pushedDoc();
      expect(doc.pins).to.deep.equal([{ _id: PIN_B, name: 'First Nation B', province: 'AB' }]);
      expect(doc.legislation_2002.applicableRegulation).to.deep.equal({ _id: REGULATION, name: null, item: null });
      expect(doc.legislation_2002.proponentName).to.be.null;
      expect(doc.legislation_2002.proponentId).to.equal(PROPONENT);
    });

    it('should not mutate the project it was handed', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();

      await demiPush.project(project);

      expect(project.pins).to.deep.equal([PIN_A, PIN_B]);
      expect(project.legislation_2002.applicableRegulation).to.equal(REGULATION);
      expect(project.legislation_2002).to.not.have.property('proponentId');
    });

    it('should enrich the plain object off a mongoose document', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const plain = projectDoc();

      await demiPush.project({ _id: 'p1', toObject: () => plain });

      expect(pushedDoc().legislation_2002.proponentName).to.equal('Acme Mining');
    });

    it('should resolve false, log once and swallow a failed Organization read', async () => {
      const model = sinon.stub(mongoose, 'model');
      model.withArgs('List').returns({ find: sinon.stub().returns({ lean: () => Promise.resolve(LISTS) }) });
      model.withArgs('Organization').returns({ find: sinon.stub().returns({ lean: () => Promise.reject(new Error('mongo down')) }) });

      const landed = await demiPush.project(projectDoc());

      expect(landed).to.be.false;
      expect(fetchStub.called).to.be.false;
      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.equal('[demiPush] project push failed');
      expect(errorStub.firstCall.args[1].error).to.equal('mongo down');
    });

    it('should not push an Update without a document or an _id', async () => {
      expect(await demiPush.recentActivity(null)).to.be.true;
      expect(await demiPush.recentActivity({ headline: 'No id' })).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should PUT an Update to the APIM eagle updates route', async () => {
      fetchStub.resolves(okResponse());
      await demiPush.recentActivity({ _id: 'u1', headline: 'Decision issued', active: true });

      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(`${BASE}/eagle/updates/u1`);
      expect(options.method).to.equal('PUT');
      expect(JSON.parse(options.body)).to.deep.equal({ doc: { _id: 'u1', headline: 'Decision issued', active: true } });
      expect(errorStub.called).to.be.false;
    });

    MIRRORED.forEach(([kind, segment]) => {
      it(`should PUT a ${kind} to the APIM eagle ${segment} route`, async () => {
        fetchStub.resolves(okResponse());
        const landed = await demiPush[kind]({ _id: 'x1', name: 'Thing', read: ['public'] });

        expect(landed).to.be.true;
        expect(fetchStub.calledOnce).to.be.true;
        const [url, options] = fetchStub.firstCall.args;
        expect(url).to.equal(`${BASE}/eagle/${segment}/x1`);
        expect(options.method).to.equal('PUT');
        expect(options.headers['Ocp-Apim-Subscription-Key']).to.equal('test-key');
        expect(JSON.parse(options.body)).to.deep.equal({ doc: { _id: 'x1', name: 'Thing', read: ['public'] } });
        expect(errorStub.called).to.be.false;
      });

      it(`should resolve false when a ${kind} PUT is rejected`, async () => {
        fetchStub.resolves(failResponse(404));

        expect(await demiPush[kind]({ _id: 'x1' })).to.be.false;
      });

      it(`should not push a ${kind} without an _id`, async () => {
        expect(await demiPush[kind]({ name: 'No id' })).to.be.true;
        expect(await demiPush[kind](null)).to.be.true;
        expect(fetchStub.called).to.be.false;
      });

      it(`should push the plain object off a mongoose ${kind} document`, async () => {
        fetchStub.resolves(okResponse());
        await demiPush[kind]({ _id: 'x1', toObject: () => ({ _id: 'x1', fromDoc: true }) });

        expect(pushedDoc()).to.deep.equal({ _id: 'x1', fromDoc: true });
      });
    });

    it('should push every field the public comment read needs, and no email', async () => {
      fetchStub.resolves(okResponse());
      await demiPush.comment(commentDoc());

      expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/comments/c1`);
      const doc = pushedDoc();
      ['isAnonymous', 'eaoStatus', 'read', 'period', 'documents', 'commentId', 'author', 'comment', 'dateAdded']
        .forEach(field => expect(doc, field).to.have.property(field));
      expect(doc.read).to.deep.equal(['public', 'staff', 'sysadmin']);
      expect(doc.isAnonymous).to.be.false;
      expect(doc.period).to.equal(PERIOD);
      expect(Object.keys(doc)).to.not.include('email');
    });

    it('should flag a deleted comment period so the mirror can drop it', async () => {
      fetchStub.resolves(okResponse());
      const period = { _id: 'cp1', project: 'p1', read: ['public'] };

      await demiPush.commentPeriod(period, { isDeleted: true });

      expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/commentperiods/cp1`);
      expect(pushedDoc()).to.deep.equal({ _id: 'cp1', project: 'p1', read: ['public'], isDeleted: true });
      // the caller's document is left alone
      expect(period).to.not.have.property('isDeleted');
    });

    it('should carry resolved List labels in the document body', async () => {
      const { listFind } = stubModels([
        { _id: 'list-type', name: 'Letter' },
        { _id: 'list-milestone', name: 'Application Review' },
        { _id: 'list-phase', name: 'Effects Assessment' },
        { _id: 'list-author', name: 'Proponent' }
      ], []);
      fetchStub.resolves(okResponse());

      const landed = await demiPush.document({
        _id: 'd1',
        type: 'list-type',
        milestone: 'list-milestone',
        projectPhase: 'list-phase',
        documentAuthorType: 'list-author'
      });

      expect(landed).to.be.true;
      expect(listFind.calledOnceWithExactly({ _schemaName: 'List' }, '_id name item type legislation')).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(`${BASE}/eagle/documents/d1`);
      expect(JSON.parse(options.body).labels).to.deep.equal({
        type: 'Letter',
        milestone: 'Application Review',
        projectPhase: 'Effects Assessment',
        documentAuthorType: 'Proponent'
      });
    });

    it('should flag a deleted document so the mirror can drop it', async () => {
      stubModels([], []);
      fetchStub.resolves(okResponse());
      const doc = { _id: 'd1', project: 'p1', read: ['public'] };

      await demiPush.document(doc, { isDeleted: true });

      expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/documents/d1`);
      expect(pushedDoc()).to.deep.equal({ _id: 'd1', project: 'p1', read: ['public'], isDeleted: true });
      // the caller's document is left alone
      expect(doc).to.not.have.property('isDeleted');
    });

    it('should PUT the config to the fixed eagle config route', async () => {
      fetchStub.resolves(okResponse());
      const landed = await demiPush.config({ ENVIRONMENT: 'test', SEARCH_API_PATH: '', LOG_LEVEL: 0 });

      expect(landed).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      // One config document, so the id is a fixed literal rather than anything off the payload
      expect(url).to.equal(`${BASE}/eagle/config/public`);
      expect(options.method).to.equal('PUT');
      expect(options.headers['Ocp-Apim-Subscription-Key']).to.equal('test-key');
      // The payload as it stands: no `{ doc }` envelope, and the kill switch survives
      expect(JSON.parse(options.body)).to.deep.equal({ ENVIRONMENT: 'test', SEARCH_API_PATH: '', LOG_LEVEL: 0 });
      expect(errorStub.called).to.be.false;
    });

    it('should not push a config without a body', async () => {
      expect(await demiPush.config(null)).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should resolve false when a config PUT is rejected', async () => {
      fetchStub.resolves(failResponse(404));

      expect(await demiPush.config({ ENVIRONMENT: 'test' })).to.be.false;
      expect(errorStub.calledOnceWith('[demiPush] config public rejected 404')).to.be.true;
    });

    it('should resolve false when a document PUT is rejected', async () => {
      stubModels([], []);
      fetchStub.resolves(failResponse(404));

      expect(await demiPush.document({ _id: 'd1' })).to.be.false;
    });
  });
});
