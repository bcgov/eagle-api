/**
 * Unit Tests for RecentActivity Controller - DEMI mirror
 *
 * DEMI owns Updates; eagle-api only mirrors the write. The mirror must never
 * hold up the response. Mongoose, Utils and demiPush are stubbed - no database.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const Utils      = require('../../api/helpers/utils');
const demiPush   = require('../../api/helpers/demiPush');
const defaultLog = require('winston').loggers.get('default');

const recentActivity = require('../../api/controllers/recentActivity');

describe('RecentActivity Controller - DEMI mirror', () => {
  const ACTIVITY_ID = '507f1f77bcf86cd799439044';
  const PROJECT_ID  = '507f1f77bcf86cd799439011';
  const DOC_ID      = '507f1f77bcf86cd799439055';
  const HIDDEN_DOC  = '507f1f77bcf86cd799439066';
  const OTHER_DOC   = '507f1f77bcf86cd799439088';
  const STORED_AT   = new Date('2026-09-01T00:00:00Z');

  let res;
  let model;
  let saved;
  let saveResult;
  let pushStub;
  let stored;
  let constructed;
  let documents;
  let documentModel;

  // Enough of a Mongo find for the queries the handlers send: ids, source, project, and read[] has / lacks.
  function findIn(rows, query) {
    const matches = row => (!query._id || !query._id.$in || query._id.$in.map(String).includes(String(row._id))) &&
      (!query.documentSource || row.documentSource === query.documentSource) &&
      (!('project' in query) || String(row.project || null) === String(query.project || null)) &&
      (query.read === undefined || (typeof query.read === 'string'
        ? (row.read || []).includes(query.read)
        : !(row.read || []).includes(query.read.$ne)));
    const found = Promise.resolve(rows.filter(matches));
    found.lean = () => found;
    return found;
  }

  function createModel() {
    function MockRecentActivity(obj) {
      Object.assign(this, obj);
      this._id = ACTIVITY_ID;
      this.save = () => saveResult();
      constructed = this;
    }
    MockRecentActivity.findOneAndUpdate = sinon.stub().callsFake(() => Promise.resolve(saved));
    MockRecentActivity.findOne = sinon.stub().returns({ lean: () => Promise.resolve(stored) });
    MockRecentActivity.deleteMany = sinon.stub().resolves({ deletedCount: 1 });
    // No other published Update shows an image, so releasing one unpublishes it.
    MockRecentActivity.find = sinon.stub().returns({ lean: () => Promise.resolve([]) });
    return MockRecentActivity;
  }

  function putArgs(active, fields) {
    return {
      swagger: {
        params: {
          recentActivityId: { value: ACTIVITY_ID },
          RecentActivityObject: { value: { active: active, headline: 'Decision issued', type: 'News', ...fields } },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  function postArgs(active, fields) {
    return {
      swagger: {
        params: {
          recentActivity: { value: { active: active, headline: 'Decision issued', project: PROJECT_ID, type: 'News', ...fields } },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  function deleteArgs() {
    return {
      swagger: {
        operation: { 'x-security-scopes': ['sysadmin'] },
        params: {
          recentActivityId: { value: ACTIVITY_ID },
          auth_payload: { preferred_username: 'testuser' }
        }
      }
    };
  }

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    saved = { _id: ACTIVITY_ID, headline: 'Decision issued', active: true };
    saveResult = () => Promise.resolve(saved);
    stored = {
      _id: ACTIVITY_ID, project: PROJECT_ID, headline: 'Decision issued', active: true, status: 'published',
      read: ['sysadmin', 'staff', 'public'], dateUpdated: STORED_AT
    };
    constructed = null;
    documents = [{ _id: DOC_ID, read: ['public', 'staff'] }, { _id: HIDDEN_DOC, read: ['staff'] }];
    documentModel = { find: sinon.stub().callsFake(query => findIn(documents, query)) };
    model = createModel();

    sinon.stub(mongoose, 'model').callsFake(name => ({ RecentActivity: model, Document: documentModel }[name] || {}));
    sinon.stub(Utils, 'recordAction').resolves();
    // Never settles: a handler that awaits the mirror would hang instead of answering
    pushStub = sinon.stub(demiPush, 'recentActivity').returns(new Promise(() => {}));

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'warn');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  describe('protectedPost', () => {
    it('mirrors the saved Update and answers without waiting for the push', async () => {
      await recentActivity.protectedPost(postArgs(true), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('mirrors an unpublished Update too, so DEMI learns it exists', async () => {
      saved.active = false;

      await recentActivity.protectedPost(postArgs(false), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
    });

    it('does not mirror when the save fails', async () => {
      saveResult = () => Promise.reject(new Error('mongo down'));

      await recentActivity.protectedPost(postArgs(true), res);

      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedPut', () => {
    it('mirrors the updated Update and answers without waiting for the push', async () => {
      await recentActivity.protectedPut(putArgs(true), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('mirrors an unpublish so DEMI takes the Update down', async () => {
      saved.active = false;

      await recentActivity.protectedPut(putArgs(false), res);

      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
    });

    it('does not mirror when the update fails', async () => {
      model.findOneAndUpdate = sinon.stub().rejects(new Error('mongo down'));

      await recentActivity.protectedPut(putArgs(true), res);

      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedDelete', () => {
    it('archives instead of deleting, and mirrors the archived row', async () => {
      await recentActivity.protectedDelete(deleteArgs(), res);

      expect(model.deleteMany.called).to.be.false;
      const [query, update] = model.findOneAndUpdate.firstCall.args;
      expect(JSON.stringify(query)).to.include(ACTIVITY_ID);
      expect(query._schemaName).to.equal('RecentActivity');
      expect(update.$set).to.include({ status: 'archived', active: false });
      expect(update.$pull).to.deep.equal({ read: 'public' });
      expect(pushStub.calledOnceWithExactly(saved)).to.be.true;
      expect(Utils.recordAction.firstCall.args.slice(0, 2)).to.deep.equal(['Archive', 'RecentActivity']);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('answers 404 and mirrors nothing when the Update does not exist', async () => {
      saved = null;

      await recentActivity.protectedDelete(deleteArgs(), res);

      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(404)).to.be.true;
    });

    it('refuses to delete the whole collection', async () => {
      const args = deleteArgs();
      delete args.swagger.params.recentActivityId;

      await recentActivity.protectedDelete(args, res);

      expect(model.findOneAndUpdate.called).to.be.false;
      expect(pushStub.called).to.be.false;
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('field checks', () => {
    const invalid = {
      'a status outside the set': { status: 'live' },
      'a shortHeadline over 70 characters': { shortHeadline: 'x'.repeat(71) },
      'a summary over 280 characters': { summary: 'x'.repeat(281) },
      'a featured image with no alt text': { featuredImage: { document: DOC_ID, alt: ' ' } },
      'a featured image caption over 300 characters': { featuredImage: { document: DOC_ID, alt: 'Map', caption: 'x'.repeat(301) } },
      'a featured image credit over 150 characters': { featuredImage: { document: DOC_ID, alt: 'Map', credit: 'x'.repeat(151) } },
      'HTML in shortHeadline': { shortHeadline: '<b>Decision</b>' },
      'HTML in summary': { summary: 'Read <a href="x">this</a>' },
      'a non-public featured image on publish': { featuredImage: { document: HIDDEN_DOC, alt: 'Map' } },
      'a non-public attachment on publish': { attachments: [DOC_ID, HIDDEN_DOC] },
      'more than 5 images': { images: Array.from({ length: 6 }, () => ({ document: DOC_ID, alt: 'Map' })) },
      'an image with no alt text': { images: [{ document: DOC_ID, alt: ' ' }] },
      'an image with no document': { images: [{ alt: 'Map' }] },
      'an image caption over 300 characters': { images: [{ document: DOC_ID, alt: 'Map', caption: 'x'.repeat(301) }] },
      'an image credit over 150 characters': { images: [{ document: DOC_ID, alt: 'Map', credit: 'x'.repeat(151) }] },
      'a non-public image on publish': { images: [{ document: DOC_ID, alt: 'Map' }, { document: HIDDEN_DOC, alt: 'Plan' }] },
      'an attachment that does not exist': { attachments: ['507f1f77bcf86cd799439077'] },
      'a javascript: engagementUrl': { engagementUrl: 'javascript:alert(1)' },
      'a Corporate Update with no subject': { category: 'Corporate', subject: '' },
      'a project Update with no project': { category: 'Project News', project: null }
    };

    Object.entries(invalid).forEach(([label, fields]) => {
      it(`POST rejects ${label} without saving`, async () => {
        const save = sinon.spy(saveResult);
        saveResult = save;

        await recentActivity.protectedPost(postArgs(true, fields), res);

        expect(res.status.calledWith(400)).to.be.true;
        expect(save.called).to.be.false;
        expect(pushStub.called).to.be.false;
      });
    });

    it('POST accepts limits exactly at the cap and a Corporate Update with a subject and no project', async () => {
      await recentActivity.protectedPost(postArgs(true, {
        shortHeadline: 'x'.repeat(70),
        summary: 'x'.repeat(280),
        featuredImage: { document: DOC_ID, alt: 'Site map', caption: 'x'.repeat(300), credit: 'x'.repeat(150) },
        attachments: [DOC_ID],
        summary: 'Costs < benefits, and 3 > 2',
        engagementUrl: 'https://engage.eao.gov.bc.ca/x',
        category: 'Corporate',
        subject: 'Policy',
        project: null
      }), res);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('POST keeps 5 images at the caption and credit caps, in the order sent', async () => {
      documents.push({ _id: OTHER_DOC, read: ['public'] });
      const images = [OTHER_DOC, DOC_ID, OTHER_DOC, DOC_ID, OTHER_DOC].map((document, i) => ({
        document, alt: `Image ${i}`, caption: 'x'.repeat(300), credit: 'x'.repeat(150)
      }));

      await recentActivity.protectedPost(postArgs(true, { images }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(constructed.images.map(image => image.alt)).to.deep.equal(['Image 0', 'Image 1', 'Image 2', 'Image 3', 'Image 4']);
    });

    it('names the non-public image it refused', async () => {
      await recentActivity.protectedPost(postArgs(true, {
        images: [{ document: DOC_ID, alt: 'Map' }, { document: HIDDEN_DOC, alt: 'Plan' }]
      }), res);

      expect(res.json.firstCall.args[0].message).to.include(HIDDEN_DOC).and.not.include(DOC_ID);
    });

    it('says which featured image field is too long', async () => {
      await recentActivity.protectedPost(postArgs(false, { featuredImage: { document: DOC_ID, alt: 'Map', credit: 'x'.repeat(151) } }), res);

      expect(res.json.firstCall.args[0].errors).to.deep.equal(['featuredImage.credit must be 150 characters or fewer']);
    });

    it('says which image lacks alt text', async () => {
      await recentActivity.protectedPost(postArgs(false, { images: [{ document: DOC_ID, alt: 'Map' }, { document: DOC_ID }] }), res);

      expect(res.json.firstCall.args[0].errors).to.deep.equal(['images[1].alt is required']);
    });

    it('names the non-public documents it refused', async () => {
      await recentActivity.protectedPost(postArgs(true, { attachments: [DOC_ID, HIDDEN_DOC] }), res);

      expect(res.json.firstCall.args[0].message).to.include(HIDDEN_DOC).and.not.include(DOC_ID);
    });

    it('lets a draft point at documents that are not public yet', async () => {
      await recentActivity.protectedPost(postArgs(false, { attachments: [HIDDEN_DOC] }), res);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('does not ask for a project on a comment period Update', async () => {
      await recentActivity.protectedPost(postArgs(true, { category: 'Engagement', project: '', pcp: PROJECT_ID }), res);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('does not ask for a project or pcp on a project notification comment period Update', async () => {
      await recentActivity.protectedPost(postArgs(true, {
        category: 'Engagement', project: null, pcp: null, type: 'Project Notification Public Comment Period'
      }), res);

      expect(res.status.calledWith(200)).to.be.true;
    });

    it('PUT judges the stored row with the body laid over it', async () => {
      stored = { ...stored, category: 'Corporate', subject: 'Policy', project: null };

      await recentActivity.protectedPut(putArgs(true, { subject: '' }), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(model.findOneAndUpdate.called).to.be.false;
    });

    it('PUT only writes over the row it read, and answers 409 when that row changed', async () => {
      saved = null;

      await recentActivity.protectedPut(putArgs(true), res);

      const [query, update] = model.findOneAndUpdate.firstCall.args;
      expect(query).to.include({ _schemaName: 'RecentActivity', dateUpdated: STORED_AT });
      expect(model.findOne.firstCall.args[0]).to.deep.equal({ _id: ACTIVITY_ID, _schemaName: 'RecentActivity' });
      expect(update.dateUpdated).to.be.instanceOf(Date).and.not.equal(STORED_AT);
      expect(res.status.calledWith(409)).to.be.true;
      expect(pushStub.called).to.be.false;
    });

    it('PUT checks for conflicts against the dateUpdated the client loaded', async () => {
      const loaded = '2026-08-15T10:00:00.000Z';

      await recentActivity.protectedPut(putArgs(true, { dateUpdated: loaded }), res);

      const [query, update] = model.findOneAndUpdate.firstCall.args;
      expect(query.dateUpdated.toISOString()).to.equal(loaded);
      expect(update.dateUpdated.getTime()).to.be.greaterThan(Date.now() - 5000);
    });

    it('PUT answers 404 when the Update does not exist', async () => {
      stored = null;

      await recentActivity.protectedPut(putArgs(true), res);

      expect(res.status.calledWith(404)).to.be.true;
      expect(model.findOneAndUpdate.called).to.be.false;
    });
  });

  describe('status keeps active and read[] in step', () => {
    const written = () => model.findOneAndUpdate.firstCall.args[1];

    it('publishing sets active, adds public and stamps publishDate', async () => {
      stored = { ...stored, active: false, read: ['sysadmin', 'staff'], status: 'draft', publishDate: null };

      await recentActivity.protectedPut(putArgs(false, { status: 'published' }), res);

      expect(written()).to.include({ status: 'published', active: true });
      expect(written().read).to.include('public');
      expect(written().publishDate).to.be.instanceOf(Date);
    });

    it('a scheduled publish keeps its own publishDate', async () => {
      const later = new Date(Date.now() + 86400000);

      await recentActivity.protectedPut(putArgs(false, { status: 'published', publishDate: later }), res);

      expect(written().publishDate).to.equal(later);
    });

    ['draft', 'archived'].forEach(status => {
      it(`${status} clears active and removes public`, async () => {
        await recentActivity.protectedPut(putArgs(true, { status }), res);

        expect(written()).to.include({ status, active: false });
        expect(written().read).to.not.include('public');
      });
    });

    it('a draft going live replaces a stored publishDate already in the past', async () => {
      stored = { ...stored, active: false, status: 'draft', publishDate: new Date('2020-01-01') };

      await recentActivity.protectedPut(putArgs(false, { status: 'published' }), res);

      expect(written().publishDate.getTime()).to.be.greaterThan(Date.now() - 5000);
    });

    // What eagle-admin sends for Publish and for Save: publishDate null means "stamp it now if new".
    const adminPublish = { status: 'published', active: true, publishDate: null };

    it('the admin re-publishing a live Update keeps the date it went live', async () => {
      stored = { ...stored, publishDate: new Date('2026-01-01') };

      await recentActivity.protectedPut(putArgs(true, adminPublish), res);

      expect(written()).to.not.have.property('publishDate');
    });

    it('the admin publishing a scheduled Update now stamps now', async () => {
      stored = { ...stored, publishDate: new Date(Date.now() + 86400000) };

      await recentActivity.protectedPut(putArgs(true, adminPublish), res);

      expect(written().publishDate.getTime()).to.be.within(Date.now() - 5000, Date.now());
    });

    it('the admin publishing a draft with no date stamps now', async () => {
      stored = { ...stored, status: 'draft', active: false, publishDate: null };

      await recentActivity.protectedPut(putArgs(true, adminPublish), res);

      expect(written().publishDate.getTime()).to.be.within(Date.now() - 5000, Date.now());
    });

    it('an edit to a live Update keeps its publishDate', async () => {
      const first = new Date('2020-01-01');
      stored = { ...stored, publishDate: first };

      await recentActivity.protectedPut(putArgs(true, { status: 'published' }), res);

      expect(written()).to.not.have.property('publishDate');
    });

    it('keeps read[] roles other than public', async () => {
      stored = { ...stored, read: ['sysadmin', 'staff', 'project-system-admin'] };

      await recentActivity.protectedPut(putArgs(false, { status: 'draft' }), res);

      expect(written().read).to.have.members(['sysadmin', 'staff', 'project-system-admin']);
    });

    it('falls back to staff roles when the stored read[] is empty', async () => {
      stored = { ...stored, read: [] };

      await recentActivity.protectedPut(putArgs(true, { status: 'published' }), res);

      expect(written().read).to.have.members(['sysadmin', 'staff', 'public']);
    });

    it('an archived Update stays archived when a client sends only active', async () => {
      stored = { ...stored, status: 'archived', active: false, read: ['sysadmin', 'staff'] };

      await recentActivity.protectedPut(putArgs(true), res);

      expect(written()).to.include({ status: 'archived', active: false });
      expect(written().read).to.not.include('public');
    });

    it('a client that sends only active gets a status derived from it', async () => {
      stored = { ...stored, status: 'published' };

      await recentActivity.protectedPut(putArgs(false), res);

      expect(written()).to.include({ status: 'draft', active: false });
    });

    it('POST derives published from active and makes the row public', async () => {
      await recentActivity.protectedPost(postArgs(true), res);

      expect(constructed).to.include({ status: 'published', active: true });
      expect(constructed.read).to.include('public');
    });

    it('never takes notifiedAt from a client', async () => {
      await recentActivity.protectedPut(putArgs(true, { notifiedAt: null }), res);
      await recentActivity.protectedPost(postArgs(true, { notifiedAt: new Date() }), res);

      expect(written()).to.not.have.property('notifiedAt');
      expect(constructed).to.not.have.property('notifiedAt');
    });
  });

  describe('Update images publish with the Update', () => {
    const UPLOAD = '507f1f77bcf86cd7994390a1';
    const SECOND_UPLOAD = '507f1f77bcf86cd7994390a2';
    let docPush;

    // A stored Document as mongoose hands it back: save() keeps the change on the same object.
    const uploaded = (_id, read = ['sysadmin', 'staff']) => {
      const doc = { _id, documentSource: 'UPDATE', project: PROJECT_ID, read };
      doc.save = sinon.stub().callsFake(() => Promise.resolve(doc));
      return doc;
    };
    const isPublic = doc => doc.read.includes('public');

    beforeEach(() => {
      docPush = sinon.stub(demiPush, 'document').resolves();
    });

    it('POST publishes a private uploaded image before the Update is saved', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      let publicWhenSaved;
      saveResult = () => { publicWhenSaved = isPublic(image); return Promise.resolve(saved); };

      await recentActivity.protectedPost(postArgs(true, { images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(publicWhenSaved).to.be.true;
      expect(image.eaoStatus).to.equal('Published');
      expect(docPush.calledWith(image)).to.be.true;
    });

    it('PUT to scheduled publishes the featured image too', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);

      await recentActivity.protectedPut(putArgs(false, {
        status: 'published', publishDate: new Date(Date.now() + 86400000), featuredImage: { document: UPLOAD, alt: 'Site' }
      }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(isPublic(image)).to.be.true;
    });

    it('a draft leaves its uploaded image private', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);

      await recentActivity.protectedPost(postArgs(false, { images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(isPublic(image)).to.be.false;
    });

    it('still refuses an uploaded image used as an attachment, since only images publish with the Update', async () => {
      documents.push(uploaded(UPLOAD));

      await recentActivity.protectedPost(postArgs(true, { attachments: [UPLOAD] }), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(res.json.firstCall.args[0].message).to.include(UPLOAD);
    });

    it('answers 500 without saving, and takes back what it published, when an image fails to publish', async () => {
      const first = uploaded(UPLOAD);
      const second = uploaded(SECOND_UPLOAD);
      second.save = sinon.stub().rejects(new Error('write failed'));
      documents.push(first, second);
      const save = sinon.spy(saveResult);
      saveResult = save;

      await recentActivity.protectedPost(postArgs(true, {
        images: [{ document: UPLOAD, alt: 'Site' }, { document: SECOND_UPLOAD, alt: 'Road' }]
      }), res);

      expect(res.status.calledWith(500)).to.be.true;
      expect(res.json.firstCall.args[0].message).to.equal('Could not publish the Update images; the Update was not saved.');
      expect(save.called).to.be.false;
      expect(isPublic(first)).to.be.false;
    });

    it('PUT takes back the images it published when the Update changed underneath (409)', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      saved = null;

      await recentActivity.protectedPut(putArgs(true, { status: 'published', images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(409)).to.be.true;
      expect(isPublic(image)).to.be.false;
    });

    it('refuses on publish an image uploaded to another project, naming it, and leaves it private', async () => {
      const image = uploaded(UPLOAD);
      image.project = '507f1f77bcf86cd7994390ff';
      documents.push(image);

      await recentActivity.protectedPost(postArgs(true, { images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(res.json.firstCall.args[0].message).to.include(UPLOAD);
      expect(isPublic(image)).to.be.false;
    });

    it('POST takes back a published image, back to no status, when the Update fails to save', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      saveResult = () => Promise.reject(new Error('mongo down'));

      await recentActivity.protectedPost(postArgs(true, { images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(isPublic(image)).to.be.false;
      expect(image.eaoStatus).to.be.null;
    });

    it('PUT takes back a published image when the Update write throws', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      model.findOneAndUpdate = sinon.stub().rejects(new Error('mongo down'));

      await recentActivity.protectedPut(putArgs(true, { status: 'published', images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(400)).to.be.true;
      expect(isPublic(image)).to.be.false;
    });

    it('POST publishes an image again when a concurrent release took it private during the save', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      Object.assign(saved, { status: 'published', project: PROJECT_ID, images: [{ document: UPLOAD, alt: 'Site' }] });
      saveResult = () => {
        image.read = image.read.filter(role => role !== 'public');
        return Promise.resolve(saved);
      };

      await recentActivity.protectedPost(postArgs(true, { images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(isPublic(image)).to.be.true;
    });

    it('PUT publishes an image again when a concurrent release took it private during the save', async () => {
      const image = uploaded(UPLOAD);
      documents.push(image);
      Object.assign(saved, { status: 'published', project: PROJECT_ID, images: [{ document: UPLOAD, alt: 'Site' }] });
      model.findOneAndUpdate = sinon.stub().callsFake(() => {
        image.read = image.read.filter(role => role !== 'public');
        return Promise.resolve(saved);
      });

      await recentActivity.protectedPut(putArgs(true, { status: 'published', images: [{ document: UPLOAD, alt: 'Site' }] }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(isPublic(image)).to.be.true;
    });

    it('logs an image it could not unpublish and still answers 200', async () => {
      const image = uploaded(UPLOAD, ['sysadmin', 'staff', 'public']);
      image.save = sinon.stub().rejects(new Error('write failed'));
      documents.push(image);
      stored.images = [{ document: UPLOAD, alt: 'Site' }];

      await recentActivity.protectedPut(putArgs(false, { status: 'draft' }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(defaultLog.error.args.map(args => args.join(' ')).join('\n')).to.include(`Could not unpublish Update image ${UPLOAD}`);
    });

    it('logs a release that failed outright and still answers 200', async () => {
      documentModel.find = sinon.stub().rejects(new Error('mongo down'));
      stored.images = [{ document: UPLOAD, alt: 'Site' }];

      await recentActivity.protectedPut(putArgs(false, { status: 'draft' }), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(defaultLog.error.args.map(args => args.join(' ')).join('\n')).to.include(`Could not release images of Update ${ACTIVITY_ID}: mongo down`);
    });
  });
});
