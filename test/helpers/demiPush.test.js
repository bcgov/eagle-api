/**
 * Unit Tests for API Helpers - DEMI Push
 *
 * Testing the dark outbound mirror to demi-api
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const winston = require('winston');

const { LEGISLATION_KEYS } = require('../../api/helpers/constants');

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

// Kinds gated by DEMI_PUSH_OPT_IN_KINDS: [export name, DEMI route segment, mongoose model]
const OPT_IN = [
  ['user', 'users', 'User'],
  ['group', 'groups', 'Group'],
  ['inspection', 'inspections', 'Inspection'],
  ['inspectionElement', 'inspection-elements', 'InspectionElement'],
  ['inspectionItem', 'inspection-items', 'InspectionItem']
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
  // Every push carries a pushedAt stamp, asserted on its own below; envelope checks drop it.
  const pushedBody = raw => {
    const body = JSON.parse(raw);
    delete body.pushedAt;
    return body;
  };

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
      expect(pushedBody(options.body)).to.deep.equal({ doc: { _id: 'p1', name: 'Test' } });
      expect(errorStub.called).to.be.false;
    });

    it('should resolve false and log once when fetch throws', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      const clock = sinon.useFakeTimers();
      const pending = demiPush.project({ _id: 'p1' });
      await clock.runAllAsync();
      const landed = await pending;

      expect(landed).to.be.false;
      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.calledOnce).to.be.true;
      const [message, meta] = errorStub.firstCall.args;
      expect(message).to.equal('[demiPush] push-dropped projects p1: failed');
      expect(meta.error).to.equal('ECONNREFUSED');
      expect(meta.stack).to.be.a('string');
    });

    it('should retry once on a 5xx', async () => {
      fetchStub.resolves(failResponse(500));
      const clock = sinon.useFakeTimers();
      const pending = demiPush.project({ _id: 'p1' });
      await clock.runAllAsync();
      const landed = await pending;

      expect(landed).to.be.false;
      expect(fetchStub.callCount).to.equal(2);
      expect(errorStub.calledOnceWith('[demiPush] push-dropped projects p1: rejected 500')).to.be.true;
    });

    it('should not retry on a 4xx', async () => {
      fetchStub.resolves(failResponse(404));
      const landed = await demiPush.project({ _id: 'p1' });

      expect(landed).to.be.false;
      expect(fetchStub.callCount).to.equal(1);
      expect(errorStub.calledOnceWith('[demiPush] push-dropped projects p1: rejected 404')).to.be.true;
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

    it('should push a pin stored more than once as one pin, in first-seen order', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = projectDoc();
      project.pins = [PIN_B, PIN_A, PIN_B, PIN_A, PIN_B];

      await demiPush.project(project);

      expect(pushedDoc().pins.map(pin => pin._id)).to.deep.equal([PIN_B, PIN_A]);
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

    it('should enrich a Building Canada Act block and pass its null refs through', async () => {
      stubModels(LISTS, ORGS);
      fetchStub.resolves(okResponse());
      const project = {
        _id: 'p25',
        currentLegislationYear: 'legislation_2025',
        pins: [],
        legislation_2025: {
          name: 'Harbour Crossing',
          proponent: PROPONENT,
          applicableRegulation: REGULATION,
          currentPhaseName: PHASE,
          phaseHistory: [PAST_PHASE],
          eacDecision: null,
          CEAAInvolvement: null
        }
      };

      await demiPush.project(project);

      const block = pushedDoc().legislation_2025;
      expect(block.name).to.equal('Harbour Crossing');
      expect(block.proponentId).to.equal(PROPONENT);
      expect(block.proponentName).to.equal('Acme Mining');
      expect(block.applicableRegulation).to.deep.equal({
        _id: REGULATION, name: 'Reviewable Projects Regulation', item: 'https://www.bclaws.ca/rpr'
      });
      expect(block.currentPhaseName).to.deep.equal({
        _id: PHASE, name: 'Application Review', type: 'projectPhase', legislation: 2002
      });
      expect(block.phaseHistory).to.deep.equal([
        { _id: PAST_PHASE, name: 'Pre-Application', type: 'projectPhase', legislation: 2002 }
      ]);
      expect(block.eacDecision).to.equal(null);
      expect(block.CEAAInvolvement).to.equal(null);
      // the caller's block is left as it was handed in
      expect(project.legislation_2025.currentPhaseName).to.equal(PHASE);
      expect(project.legislation_2025).to.not.have.property('proponentName');
    });

    // Guard: a new registry Act must be copied (toPushBody) and enriched (enrichProject) like the others.
    LEGISLATION_KEYS.forEach(key => {
      it(`should copy and enrich a ${key} block without touching the caller's`, async () => {
        stubModels(LISTS, ORGS);
        fetchStub.resolves(okResponse());
        const project = { _id: 'p1', currentLegislationYear: key, pins: [], [key]: { name: 'Any', proponent: PROPONENT } };

        await demiPush.project(project);

        expect(pushedDoc()[key].proponentName).to.equal('Acme Mining');
        expect(project[key]).to.not.have.property('proponentName');
      });
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
      expect(errorStub.firstCall.args[0]).to.equal(`[demiPush] push-dropped projects ${projectDoc()._id}: failed`);
      expect(errorStub.firstCall.args[1].error).to.equal('mongo down');
    });

    it('should log a config push that throws before it is sent as dropped', async () => {
      const body = { get ENVIRONMENT() { throw new Error('unreadable body'); } };

      expect(await demiPush.config(body)).to.be.false;
      expect(fetchStub.called).to.be.false;
      expect(errorStub.calledOnceWith('[demiPush] push-dropped config public: failed')).to.be.true;
      expect(errorStub.firstCall.args[1].error).to.equal('unreadable body');
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
      expect(pushedBody(options.body)).to.deep.equal({ doc: { _id: 'u1', headline: 'Decision issued', active: true } });
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
        expect(pushedBody(options.body)).to.deep.equal({ doc: { _id: 'x1', name: 'Thing', read: ['public'] } });
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

    describe('date the stored row does not hold', () => {
      const Organization = require('../../api/helpers/models/organization');
      const ORG_ID = '5f4c7d1e2b3a4c5d6e7f00aa';

      it('should not push a date the schema made up for a row without one', async () => {
        fetchStub.resolves(okResponse());
        await demiPush.organization(Organization.hydrate({ _id: ORG_ID, name: 'Undated Org' }));

        const doc = pushedDoc();
        expect(doc.name).to.equal('Undated Org');
        expect(doc).to.not.have.property('dateAdded');
        expect(doc).to.not.have.property('dateUpdated');
      });

      it('should push the dates a row does hold', async () => {
        fetchStub.resolves(okResponse());
        const dateAdded = new Date('2020-01-02T03:04:05.000Z');
        await demiPush.organization(Organization.hydrate({ _id: ORG_ID, name: 'Dated Org', dateAdded }));

        expect(pushedDoc().dateAdded).to.equal(dateAdded.toISOString());
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
      expect(pushedBody(options.body)).to.deep.equal({ ENVIRONMENT: 'test', SEARCH_API_PATH: '', LOG_LEVEL: 0 });
      expect(errorStub.called).to.be.false;
    });

    it('should not push a config without a body', async () => {
      expect(await demiPush.config(null)).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should resolve false when a config PUT is rejected', async () => {
      fetchStub.resolves(failResponse(404));

      expect(await demiPush.config({ ENVIRONMENT: 'test' })).to.be.false;
      expect(errorStub.calledOnceWith('[demiPush] push-dropped config public: rejected 404')).to.be.true;
    });

    describe('one push at a time per record', () => {
      // `db.readyState` is what demiPush checks before it asks Mongo for anything.
      const stubModel = (name, findById) => ({
        modelName: name,
        db: { readyState: 1 },
        findById: sinon.stub().callsFake(findById)
      });

      function stubMongoose(models) {
        const model = sinon.stub(mongoose, 'model');
        model.withArgs('List').returns({ find: () => ({ lean: () => Promise.resolve(LISTS) }) });
        model.withArgs('Organization').returns({ find: () => ({ lean: () => Promise.resolve(ORGS) }) });
        Object.entries(models).forEach(([name, stub]) => model.withArgs(name).returns(stub));
        return models;
      }

      function deferred() {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        return { promise, resolve };
      }

      // Let every pending microtask run, so an unsequenced second push would have reached fetch.
      const settle = () => new Promise(setImmediate);

      const published = () => ({
        _id: 'p1',
        isPublished: true,
        read: ['public', 'staff'],
        currentLegislationYear: 'legislation_2002',
        legislation_2002: { name: 'Fresh' }
      });

      it('should hold a second push for the same project until the first one has landed', async () => {
        stubMongoose({ Project: stubModel('Project', () => Promise.resolve(published())) });
        const inFlight = deferred();
        fetchStub.onCall(0).returns(inFlight.promise);
        fetchStub.onCall(1).resolves(okResponse());

        // save-and-publish: the pre-publish copy goes out first, the published one right behind it
        const stale = demiPush.project({ _id: 'p1', isPublished: false, read: ['staff'], legislation_2002: { name: 'Stale' } });
        const fresh = demiPush.project({ _id: 'p1', isPublished: true, read: ['public', 'staff'] });

        await settle();
        expect(fetchStub.callCount, 'second push must wait for the first').to.equal(1);

        inFlight.resolve(okResponse());
        expect(await Promise.all([stale, fresh])).to.deep.equal([true, true]);
        expect(fetchStub.callCount).to.equal(2);
        expect(fetchStub.getCalls().map(c => c.args[0])).to.deep.equal([
          `${BASE}/eagle/projects/p1`, `${BASE}/eagle/projects/p1`
        ]);
      });

      it('should build each push from the project as Mongo has it, not from the caller\'s copy', async () => {
        stubMongoose({ Project: stubModel('Project', () => Promise.resolve(published())) });
        fetchStub.resolves(okResponse());

        await demiPush.project({ _id: 'p1', isPublished: false, read: ['staff'], legislation_2002: { name: 'Stale' } });

        const doc = pushedDoc();
        expect(doc.isPublished).to.be.true;
        expect(doc.read).to.deep.equal(['public', 'staff']);
        expect(doc.legislation_2002.name).to.equal('Fresh');
      });

      it('should not hold a push for one project behind another project', async () => {
        stubMongoose({ Project: stubModel('Project', id => Promise.resolve({ _id: id })) });
        const blocked = deferred();
        fetchStub.withArgs(`${BASE}/eagle/projects/p1`).returns(blocked.promise);
        fetchStub.withArgs(`${BASE}/eagle/projects/p2`).resolves(okResponse());

        const stuck = demiPush.project({ _id: 'p1' });
        expect(await demiPush.project({ _id: 'p2' })).to.be.true;

        blocked.resolve(okResponse());
        expect(await stuck).to.be.true;
      });

      it('should push the caller\'s copy when the row is gone, so a delete mirror still lands', async () => {
        stubMongoose({ CommentPeriod: stubModel('CommentPeriod', () => Promise.resolve(null)) });
        const debugStub = sinon.stub(defaultLog, 'debug');
        fetchStub.resolves(okResponse());

        await demiPush.commentPeriod({ _id: 'cp1', project: 'p1', read: ['public'] }, { isDeleted: true });

        expect(pushedDoc()).to.deep.equal({ _id: 'cp1', project: 'p1', read: ['public'], isDeleted: true });
        expect(debugStub.calledOnceWith('[demiPush] commentperiods cp1 gone from Mongo, pushing the caller\'s copy')).to.be.true;
        expect(warnStub.called).to.be.false;
      });

      it('should push the caller\'s copy and warn when the re-read fails', async () => {
        stubMongoose({ Comment: stubModel('Comment', () => Promise.reject(new Error('mongo down'))) });
        fetchStub.resolves(okResponse());

        expect(await demiPush.comment({ _id: 'c1', comment: 'Body text' })).to.be.true;

        expect(pushedDoc()).to.deep.equal({ _id: 'c1', comment: 'Body text' });
        expect(warnStub.calledOnce).to.be.true;
        expect(warnStub.firstCall.args[0]).to.equal('[demiPush] comments c1 re-read failed, pushing the caller\'s copy');
        expect(errorStub.called).to.be.false;
      });

      it('should keep a third push behind the second and leave no chain entry behind', async () => {
        // readyState 0 skips the re-read, so each push carries the name its caller passed in.
        stubMongoose({ Project: { modelName: 'Project', db: { readyState: 0 }, findById: sinon.stub() } });
        const gates = { A: deferred(), B: deferred(), C: deferred() };
        const events = [];
        fetchStub.callsFake((url, options) => {
          const name = JSON.parse(options.body).doc.name;
          events.push(`${name} start`);
          return gates[name].promise.then(response => {
            events.push(`${name} end`);
            return response;
          });
        });

        const a = demiPush.project({ _id: 'p1', name: 'A' });
        const b = demiPush.project({ _id: 'p1', name: 'B' });
        await settle();
        expect(events).to.deep.equal(['A start']);

        gates.A.resolve(okResponse());
        await settle();
        // C is queued only once A has drained, when a broken drain guard would have dropped the live chain.
        const c = demiPush.project({ _id: 'p1', name: 'C' });
        await settle();
        expect(events, 'C must wait for B').to.deep.equal(['A start', 'A end', 'B start']);

        gates.B.resolve(okResponse());
        await settle();
        gates.C.resolve(okResponse());
        expect(await Promise.all([a, b, c])).to.deep.equal([true, true, true]);
        await settle();

        expect(events).to.deep.equal(['A start', 'A end', 'B start', 'B end', 'C start', 'C end']);
        expect(demiPush._pendingCount(), 'the queue must be empty once every push has settled').to.equal(0);
      });

      it('should skip the re-read when no Mongo connection is up', async () => {
        const offline = { modelName: 'Project', db: { readyState: 0 }, findById: sinon.stub() };
        stubMongoose({ Project: offline });
        fetchStub.resolves(okResponse());

        await demiPush.project({ _id: 'p1', isPublished: true });

        expect(offline.findById.called).to.be.false;
        expect(pushedDoc()).to.deep.equal({ _id: 'p1', isPublished: true });
      });
    });

    describe('ordering stamp', () => {
      // Three pods push the same record, so in-process ordering cannot help; DEMI compares the stamps.
      const NOW = 1757894400000;

      it('should stamp the push body with an integer pushedAt, outside the mirrored document', async () => {
        stubModels([], []);
        sinon.useFakeTimers({ now: NOW, toFake: ['Date'] });
        fetchStub.resolves(okResponse());

        await demiPush.project({ _id: 'p1', name: 'Test' });

        const body = JSON.parse(fetchStub.firstCall.args[1].body);
        expect(Number.isInteger(body.pushedAt), 'pushedAt must be a ms epoch integer').to.be.true;
        expect(body.pushedAt).to.equal(NOW);
        expect(body.doc).to.not.have.property('pushedAt');
      });

      it('should stamp every mirrored kind and the config push', async () => {
        stubModels([], []);
        sinon.useFakeTimers({ now: NOW, toFake: ['Date'] });
        fetchStub.resolves(okResponse());

        await demiPush.comment({ _id: 'c1', comment: 'Body text' });
        await demiPush.document({ _id: 'd1', project: 'p1' });
        await demiPush.config({ ENVIRONMENT: 'test' });

        const stamps = fetchStub.getCalls().map(call => JSON.parse(call.args[1].body).pushedAt);
        expect(stamps).to.deep.equal([NOW, NOW, NOW]);
      });

      it('should not let a later push carry an older stamp than the one before it', async () => {
        stubModels([], []);
        const clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date'] });
        fetchStub.resolves(okResponse());

        await demiPush.project({ _id: 'p1', name: 'First' });
        clock.tick(5000);
        await demiPush.project({ _id: 'p1', name: 'Second' });

        const [first, second] = fetchStub.getCalls().map(call => JSON.parse(call.args[1].body).pushedAt);
        expect(second, 'the later push must not be stamped older').to.be.at.least(first);
        expect(second - first).to.equal(5000);
      });
    });

    it('should resolve false when a document PUT is rejected', async () => {
      stubModels([], []);
      fetchStub.resolves(failResponse(404));

      expect(await demiPush.document({ _id: 'd1' })).to.be.false;
    });

    describe('parked on a missing parent', () => {
      const DOC = '5f4c7d1e2b3a4c5d6e7f00d1';
      const OTHER_DOC = '5f4c7d1e2b3a4c5d6e7f00d2';
      const GIVE_UP = `[demiPush] push-dropped documents ${DOC}: rejected 404 (parent not found)`;
      const refused = code => new Response(JSON.stringify({ error: 'Parent project or notification not found', code }), { status: 404 });
      const parentMissing = () => refused('PARENT_NOT_FOUND');
      const urls = () => fetchStub.getCalls().map(call => call.args[0]);
      // Let a retry started off a timer or a parent push run through to its fetch.
      const settle = () => new Promise(setImmediate);
      let clock;
      let originalQueueMax;

      beforeEach(() => {
        stubModels([], []);
        clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        originalQueueMax = process.env.DEMI_PUSH_QUEUE_MAX;
      });

      afterEach(() => {
        if (originalQueueMax === undefined) { delete process.env.DEMI_PUSH_QUEUE_MAX; } else { process.env.DEMI_PUSH_QUEUE_MAX = originalQueueMax; }
      });

      it('should re-push a parked document once a push of its project lands in this pod', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        expect(await demiPush.document({ _id: DOC, project: 'p1' })).to.be.false;
        expect(await demiPush.project({ _id: 'p1' })).to.be.true;
        await settle();

        expect(urls()).to.deep.equal([`${BASE}/eagle/documents/${DOC}`, `${BASE}/eagle/projects/p1`, `${BASE}/eagle/documents/${DOC}`]);
        expect(errorStub.called).to.be.false;
      });

      it('should match a parked document to its project when the ref is an ObjectId', async () => {
        const PROJECT = '5f4c7d1e2b3a4c5d6e7f00a1';
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: new mongoose.Types.ObjectId(PROJECT) });
        await demiPush.project({ _id: PROJECT });
        await settle();

        expect(urls()).to.deep.equal([`${BASE}/eagle/documents/${DOC}`, `${BASE}/eagle/projects/${PROJECT}`, `${BASE}/eagle/documents/${DOC}`]);
      });

      it('should leave a parked document alone when a different project lands', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' });
        await demiPush.project({ _id: 'p2' });
        await settle();

        expect(urls()).to.deep.equal([`${BASE}/eagle/documents/${DOC}`, `${BASE}/eagle/projects/p2`]);
      });

      it('should re-push a parked document after 30 s when another pod pushed its project', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' });
        await clock.tickAsync(29999);
        expect(fetchStub.callCount).to.equal(1);
        await clock.tickAsync(1);
        await settle();

        expect(urls()).to.deep.equal([`${BASE}/eagle/documents/${DOC}`, `${BASE}/eagle/documents/${DOC}`]);
        expect(errorStub.called).to.be.false;
      });

      it('should give up after the 5 min retry with the parent-not-found drop line', async () => {
        fetchStub.callsFake(parentMissing);

        await demiPush.document({ _id: DOC, project: 'p1' });
        await clock.tickAsync(30000);
        await settle();
        expect(errorStub.called, 'not dropped while a retry is left').to.be.false;
        await clock.tickAsync(300000);
        await settle();

        expect(fetchStub.callCount).to.equal(3);
        expect(errorStub.args.map(args => args[0])).to.deep.equal([GIVE_UP]);
      });

      it('should drop a refusal that would park past DEMI_PUSH_QUEUE_MAX and keep the one parked', async () => {
        process.env.DEMI_PUSH_QUEUE_MAX = '1';
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.onCall(1).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' });
        await demiPush.document({ _id: OTHER_DOC, project: 'p1' });
        expect(errorStub.args.map(args => args[0])).to.deep.equal([`[demiPush] push-dropped documents ${OTHER_DOC}: rejected 404 (parent not found)`]);
        await clock.tickAsync(30000);
        await settle();

        expect(urls()[2]).to.equal(`${BASE}/eagle/documents/${DOC}`);
      });

      it('should keep the isDeleted marker of a parked delete on its retry', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' }, { isDeleted: true });
        await clock.tickAsync(30000);
        await settle();

        expect(JSON.parse(fetchStub.secondCall.args[1].body).doc).to.deep.equal({ _id: DOC, project: 'p1', isDeleted: true });
      });

      it('should not park a refusal for a malformed parent ref', async () => {
        fetchStub.callsFake(() => refused('PARENT_REF_INVALID'));

        await demiPush.document({ _id: DOC, project: 'not-an-id' });
        await clock.tickAsync(30000);
        await settle();

        expect(fetchStub.callCount).to.equal(1);
        expect(errorStub.args.map(args => args[0])).to.deep.equal([`[demiPush] push-dropped documents ${DOC}: rejected 404`]);
      });

      it('should not retry a parked document once a later push of it has landed', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' });
        expect(await demiPush.document({ _id: DOC, project: 'p1' })).to.be.true;
        await clock.tickAsync(30000);
        await settle();

        expect(fetchStub.callCount).to.equal(2);
      });

      it('should log a parked record as dropped at shutdown and not retry it', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.document({ _id: DOC, project: 'p1' });
        demiPush.logParked();
        await clock.tickAsync(30000);
        await settle();

        expect(errorStub.args.map(args => args[0])).to.deep.equal([GIVE_UP]);
        expect(fetchStub.callCount).to.equal(1);
      });

      it('should park a comment on its comment period and re-push it once that period lands', async () => {
        fetchStub.onCall(0).callsFake(parentMissing);
        fetchStub.resolves(okResponse());

        await demiPush.comment({ _id: 'c1', period: PERIOD });
        await demiPush.commentPeriod({ _id: PERIOD, project: 'p1' });
        await settle();

        expect(urls()).to.deep.equal([`${BASE}/eagle/comments/c1`, `${BASE}/eagle/commentperiods/${PERIOD}`, `${BASE}/eagle/comments/c1`]);
      });
    });

    // DEMI has no route for these yet, so they stay off until DEMI_PUSH_OPT_IN_KINDS names them.
    describe('opt-in kinds', () => {
      let originalOptIn;
      let rows;

      const connected = (name, row) => ({
        modelName: name,
        db: { readyState: 1 },
        findById: sinon.stub().resolves(row)
      });

      // Every model the push could reach, connected, so a read would show up on its findById.
      function stubAllModels(row) {
        rows = {};
        const model = sinon.stub(mongoose, 'model');
        OPT_IN.forEach(([, , modelName]) => {
          rows[modelName] = connected(modelName, row);
          model.withArgs(modelName).returns(rows[modelName]);
        });
      }

      beforeEach(() => {
        originalOptIn = process.env.DEMI_PUSH_OPT_IN_KINDS;
        delete process.env.DEMI_PUSH_OPT_IN_KINDS;
        fetchStub.resolves(okResponse());
      });

      afterEach(() => {
        if (originalOptIn === undefined) { delete process.env.DEMI_PUSH_OPT_IN_KINDS; } else { process.env.DEMI_PUSH_OPT_IN_KINDS = originalOptIn; }
      });

      OPT_IN.forEach(([kind, segment, modelName]) => {
        it(`should neither read Mongo nor call fetch for ${kind} while the opt-in list is unset`, async () => {
          stubAllModels({ _id: 'x1' });

          expect(await demiPush[kind]({ _id: 'x1' })).to.be.true;

          expect(fetchStub.called).to.be.false;
          expect(rows[modelName].findById.called).to.be.false;
          expect(demiPush._pendingCount()).to.equal(0);
        });

        it(`should PUT the ${kind} as Mongo holds it to the APIM eagle ${segment} route once opted in`, async () => {
          stubAllModels({ _id: 'x1', name: 'Stored', read: ['sysadmin'] });
          process.env.DEMI_PUSH_OPT_IN_KINDS = segment;

          expect(await demiPush[kind]({ _id: 'x1', name: 'Caller copy' })).to.be.true;

          const [url, options] = fetchStub.firstCall.args;
          expect(url).to.equal(`${BASE}/eagle/${segment}/x1`);
          expect(options.method).to.equal('PUT');
          expect(pushedBody(options.body)).to.deep.equal({ doc: { _id: 'x1', name: 'Stored', read: ['sysadmin'] } });
        });
      });

      it('should skip a kind the opt-in list does not name, even with others on it', async () => {
        stubAllModels({ _id: 'u1' });
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'groups,inspections';

        await demiPush.user({ _id: 'u1' });

        expect(fetchStub.called).to.be.false;
        expect(rows.User.findById.called).to.be.false;
      });

      it('should read a spaced opt-in list', async () => {
        stubAllModels(null);
        process.env.DEMI_PUSH_OPT_IN_KINDS = ' users , inspection-items ';

        await demiPush.inspectionItem({ _id: 'i1' });

        expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/inspection-items/i1`);
      });

      it('should flag a deleted group with the caller\'s copy once the row is gone', async () => {
        stubAllModels(null);
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'groups';
        const group = { _id: 'g1', project: 'p1', members: ['u1'] };

        await demiPush.group(group, { isDeleted: true });

        expect(pushedDoc()).to.deep.equal({ _id: 'g1', project: 'p1', members: ['u1'], isDeleted: true });
        expect(group).to.not.have.property('isDeleted');
      });

      it('should leave a password hash and salt out of a user push', async () => {
        stubAllModels({ _id: 'u1', displayName: 'Jane', password: 'hash', salt: 'salt' });
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'users';

        await demiPush.user({ _id: 'u1' });

        const doc = pushedDoc();
        expect(doc.displayName).to.equal('Jane');
        expect(doc).to.not.have.property('password');
        expect(doc).to.not.have.property('salt');
      });

      // A push by id has no copy of its own, so falling back to the snapshot would blank DEMI's row.
      [['group', 'groups', 'Group'], ['inspection', 'inspections', 'Inspection']].forEach(([kind, segment, modelName]) => {
        [['fails', model => model.findById.rejects(new Error('mongo unreachable'))], ['misses', model => model.findById.resolves(null)]]
          .forEach(([outcome, breakRead]) => {
            it(`should send nothing and log a drop when the re-read of a ${kind} pushed by id ${outcome}`, async () => {
              stubAllModels(null);
              breakRead(rows[modelName]);
              process.env.DEMI_PUSH_OPT_IN_KINDS = segment;

              expect(await demiPush.pushIfMatched(demiPush[kind], { matchedCount: 1 }, 'x1')).to.be.false;

              expect(fetchStub.called).to.be.false;
              expect(errorStub.calledWithMatch(`[demiPush] push-dropped ${segment} x1: failed (no stored row to send)`)).to.be.true;
            });
          });
      });

      it('should push a group by id with the row Mongo holds once the write matched it', async () => {
        stubAllModels({ _id: 'g1', name: 'Advisory', members: ['u1'] });
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'groups';

        expect(await demiPush.pushIfMatched(demiPush.group, { matchedCount: 1 }, 'g1')).to.be.true;

        expect(pushedDoc()).to.deep.equal({ _id: 'g1', name: 'Advisory', members: ['u1'] });
      });

      it('should neither read nor push by id when the write matched nothing', async () => {
        stubAllModels({ _id: 'g1' });
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'groups';

        expect(await demiPush.pushIfMatched(demiPush.group, { matchedCount: 0 }, 'g1')).to.be.true;

        expect(rows.Group.findById.called).to.be.false;
        expect(fetchStub.called).to.be.false;
      });

      it('should resolve false and log a drop when the users of an organization cannot be read', async () => {
        sinon.stub(mongoose, 'model').withArgs('User').returns({
          find: () => ({ lean: () => Promise.reject(new Error('mongo unreachable')) })
        });
        process.env.DEMI_PUSH_OPT_IN_KINDS = 'users';

        expect(await demiPush.usersOfOrganization('5f4c7d1e2b3a4c5d6e7f00aa')).to.be.false;

        expect(fetchStub.called).to.be.false;
        expect(errorStub.calledWithMatch('[demiPush] push-dropped users of organization 5f4c7d1e2b3a4c5d6e7f00aa: failed (user lookup failed)')).to.be.true;
      });

      it('should keep pushing the existing kinds with the opt-in list unset', async () => {
        await demiPush.comment({ _id: 'c1' });

        expect(fetchStub.firstCall.args[0]).to.equal(`${BASE}/eagle/comments/c1`);
      });
    });
  });

  describe('awaitMirror', () => {
    const NOT_MIRRORED = 'not mirrored (see push-dropped line)';
    let originalAwaitMs;
    let originalOptIn;

    beforeEach(() => {
      process.env.DEMI_API_BASE = BASE;
      process.env.DEMI_APIM_KEY = 'test-key';
      originalAwaitMs = process.env.DEMI_PUSH_AWAIT_MS;
      originalOptIn = process.env.DEMI_PUSH_OPT_IN_KINDS;
    });

    afterEach(() => {
      if (originalAwaitMs === undefined) { delete process.env.DEMI_PUSH_AWAIT_MS; } else { process.env.DEMI_PUSH_AWAIT_MS = originalAwaitMs; }
      if (originalOptIn === undefined) { delete process.env.DEMI_PUSH_OPT_IN_KINDS; } else { process.env.DEMI_PUSH_OPT_IN_KINDS = originalOptIn; }
    });

    it('should report mirrored when the push lands', async () => {
      fetchStub.resolves(okResponse());

      const result = await demiPush.awaitMirror(demiPush.project({ _id: 'p1' }));

      expect(result).to.deep.equal({ mirrored: true, failures: [] });
    });

    it('should name the record when the push is dropped after two 5xx', async () => {
      fetchStub.resolves(failResponse(500));
      const clock = sinon.useFakeTimers();
      const pending = demiPush.awaitMirror(demiPush.project({ _id: 'p1' }));
      await clock.runAllAsync();

      expect(await pending).to.deep.equal({ mirrored: false, failures: [{ kind: 'projects', id: 'p1', reason: NOT_MIRRORED }] });
      expect(fetchStub.callCount).to.equal(2);
    });

    it('should report a push DEMI refused with a 409 as not mirrored', async () => {
      fetchStub.resolves(failResponse(409));

      const result = await demiPush.awaitMirror(demiPush.comment({ _id: 'c1' }));

      expect(result.failures).to.deep.equal([{ kind: 'comments', id: 'c1', reason: NOT_MIRRORED }]);
    });

    it('should give up at the deadline and leave the push running', async () => {
      process.env.DEMI_PUSH_AWAIT_MS = '50';
      const clock = sinon.useFakeTimers();
      fetchStub.callsFake(() => new Promise(resolve => setTimeout(() => resolve(okResponse()), 100)));
      const push = demiPush.project({ _id: 'p1' });
      const pending = demiPush.awaitMirror(push);

      await clock.tickAsync(50);
      expect(await pending).to.deep.equal({ mirrored: false, failures: [{ kind: 'projects', id: 'p1', reason: 'timeout' }] });

      await clock.tickAsync(50);
      expect(await push).to.be.true;
    });

    // setTimeout fires at once for a delay above 2^31-1, which would time out every write.
    [['2147483647', 2147483647], ['2147483648', 25000]].forEach(([env, expected]) => {
      it(`should wait ${expected} ms when DEMI_PUSH_AWAIT_MS is ${env}`, async () => {
        process.env.DEMI_PUSH_AWAIT_MS = env;
        const timeout = sinon.spy(global, 'setTimeout');

        await demiPush.awaitMirror(Promise.resolve(true));

        expect(timeout.calledOnceWith(sinon.match.func, expected, 'timeout')).to.be.true;
      });
    });

    it('should clear its deadline timer once every push settles', async () => {
      const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      await demiPush.awaitMirror(Promise.resolve(true));

      expect(clock.countTimers()).to.equal(0);
    });

    it('should report a record DEMI parked for a missing parent as parked', async () => {
      stubModels([], []);
      sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fetchStub.callsFake(() => new Response(JSON.stringify({ code: 'PARENT_NOT_FOUND' }), { status: 404 }));

      const result = await demiPush.awaitMirror(demiPush.document({ _id: 'd1', project: 'p1' }));
      // Parked records live in module state; leaving d1 behind would re-push it in a later test.
      demiPush.logParked();

      expect(result.failures).to.deep.equal([{ kind: 'documents', id: 'd1', reason: 'parked: parent not in DEMI yet' }]);
    });

    it('should report mirrored when pushes are off', async () => {
      delete process.env.DEMI_API_BASE;

      expect((await demiPush.awaitMirror(demiPush.project({ _id: 'p1' }))).mirrored).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should report mirrored for an opt-in kind that is not turned on', async () => {
      delete process.env.DEMI_PUSH_OPT_IN_KINDS;

      expect((await demiPush.awaitMirror(demiPush.user({ _id: 'u1' }))).mirrored).to.be.true;
      expect(fetchStub.called).to.be.false;
    });

    it('should report not mirrored when a matched write is pushed by id and the push finds no row', async () => {
      const missing = { modelName: 'Comment', db: { readyState: 1 }, findById: sinon.stub().resolves(null) };
      sinon.stub(mongoose, 'model').returns(missing);

      const result = await demiPush.awaitMirror(demiPush.pushIfMatched(demiPush.comment, { matchedCount: 1 }, 'c1'));

      expect(result.failures).to.deep.equal([{ kind: 'comments', id: 'c1', reason: NOT_MIRRORED }]);
      expect(fetchStub.called).to.be.false;
    });

    it('should skip null entries and report only the push that failed', async () => {
      fetchStub.callsFake(url => (url.includes('/comments/') ? failResponse(409) : okResponse()));

      const result = await demiPush.awaitMirror([null, demiPush.project({ _id: 'p1' }), undefined, demiPush.comment({ _id: 'c1' })]);

      expect(result).to.deep.equal({ mirrored: false, failures: [{ kind: 'comments', id: 'c1', reason: NOT_MIRRORED }] });
    });

    it('should report a rejected push with its message instead of rejecting', async () => {
      const push = Object.assign(Promise.reject(new Error('boom')), { kind: 'projects', id: 'p1' });

      const result = await demiPush.awaitMirror(push);

      expect(result.failures).to.deep.equal([{ kind: 'projects', id: 'p1', reason: 'failed: boom' }]);
    });

    it('should name the organization when its users cannot be looked up', async () => {
      sinon.stub(mongoose, 'model').withArgs('User').returns({
        find: () => ({ lean: () => Promise.reject(new Error('mongo unreachable')) })
      });
      process.env.DEMI_PUSH_OPT_IN_KINDS = 'users';

      const result = await demiPush.awaitMirror(demiPush.usersOfOrganization('5f4c7d1e2b3a4c5d6e7f00aa'));

      expect(result.failures).to.deep.equal([{ kind: 'users', id: 'of organization 5f4c7d1e2b3a4c5d6e7f00aa', reason: NOT_MIRRORED }]);
    });
  });
});
