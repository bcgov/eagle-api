/**
 * Unit Tests for API Helpers - Actions
 * 
 * Testing action functions for publish/unpublish operations
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const actions = require('../../api/helpers/actions');
const demiPush = require('../../api/helpers/demiPush');
const { OID } = require('../support/demiPushHarness');
const defaultLog = require('winston').loggers.get('default');

describe('Actions Helper Functions', () => {
  
  describe('publish', () => {
    it('should add public to read array if not already published', async () => {
      const mockObject = {
        read: ['sysadmin', 'staff'],
        save: sinon.stub().resolves({ read: ['sysadmin', 'staff', 'public'] })
      };

      const result = await actions.publish(mockObject);
      
      expect(mockObject.read).to.include('public');
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should not duplicate public if already published', async () => {
      const mockObject = {
        read: ['sysadmin', 'staff', 'public'],
        save: sinon.stub().resolves()
      };

      const result = await actions.publish(mockObject);
      
      const publicCount = mockObject.read.filter(r => r === 'public').length;
      expect(publicCount).to.equal(1);
    });

    it('should call save when object is newly published', async () => {
      const mockObject = {
        read: ['sysadmin'],
        save: sinon.stub().resolves()
      };

      await actions.publish(mockObject);
      
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should not call save when save=false and already published', async () => {
      const mockObject = {
        read: ['public'],
        save: sinon.stub().resolves()
      };

      await actions.publish(mockObject, false);
      
      expect(mockObject.save.called).to.be.false;
    });

    it('should handle empty read array', async () => {
      const mockObject = {
        read: [],
        save: sinon.stub().resolves()
      };

      await actions.publish(mockObject);
      
      expect(mockObject.read).to.include('public');
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should update isPublished field if it exists in schema', async () => {
      const mockObject = {
        read: ['sysadmin'],
        isPublished: false,
        schema: {
          paths: {
            isPublished: {}
          }
        },
        save: sinon.stub().resolves()
      };

      await actions.publish(mockObject);

      expect(mockObject.isPublished).to.be.true;
      expect(mockObject.save.calledOnce).to.be.true;
    });
  });

  describe('unPublish', () => {
    it('should remove public from read array if published', async () => {
      const mockObject = {
        read: ['sysadmin', 'staff', 'public'],
        save: sinon.stub().resolves({ read: ['sysadmin', 'staff'] })
      };

      const result = await actions.unPublish(mockObject);
      
      expect(mockObject.read).to.not.include('public');
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should not modify read array if not published', async () => {
      const mockObject = {
        read: ['sysadmin', 'staff'],
        save: sinon.stub().resolves()
      };

      await actions.unPublish(mockObject);
      
      expect(mockObject.save.called).to.be.false;
      expect(mockObject.read).to.have.lengthOf(2);
    });

    it('should call save when unpublishing', async () => {
      const mockObject = {
        read: ['public', 'sysadmin'],
        save: sinon.stub().resolves()
      };

      await actions.unPublish(mockObject);
      
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should preserve other roles when unpublishing', async () => {
      const mockObject = {
        read: ['sysadmin', 'staff', 'public', 'admin'],
        save: sinon.stub().resolves()
      };

      await actions.unPublish(mockObject);
      
      expect(mockObject.read).to.include('sysadmin');
      expect(mockObject.read).to.include('staff');
      expect(mockObject.read).to.include('admin');
      expect(mockObject.read).to.not.include('public');
    });

    it('should handle multiple public entries', async () => {
      const mockObject = {
        read: ['public', 'sysadmin', 'public'],
        save: sinon.stub().resolves()
      };

      await actions.unPublish(mockObject);
      
      const publicCount = mockObject.read.filter(r => r === 'public').length;
      expect(publicCount).to.equal(0);
    });

    it('should update isPublished to false if it exists in schema', async () => {
      const mockObject = {
        read: ['sysadmin', 'public'],
        isPublished: true,
        schema: {
          paths: {
            isPublished: {}
          }
        },
        save: sinon.stub().resolves()
      };

      await actions.unPublish(mockObject);

      expect(mockObject.isPublished).to.be.false;
      expect(mockObject.save.calledOnce).to.be.true;
    });
  });

  // The real Project schema declares neither tags nor isDeleted, so a stand-in object would hide
  // what strict mode drops.
  describe('delete', () => {
    const Project = require('../../api/helpers/models/project');
    let saved;

    // A stored project as Mongo hands it back; save records the update it would send.
    const storedProject = fields => {
      const row = Project.hydrate({ _id: new mongoose.Types.ObjectId(), read: ['public', 'staff'], ...fields });
      row.save = function () {
        saved = this.$getChanges().$set;
        return Promise.resolve(this);
      };
      return row;
    };

    it('should write isDeleted on a project with no tags', async () => {
      const deleted = await actions.delete(storedProject({}));

      expect(saved.isDeleted).to.equal(true);
      expect(saved).to.not.have.property('tags');
      expect(deleted.get('isDeleted')).to.equal(true);
    });

    it('should drop only the public tag from a project that still holds tags', async () => {
      await actions.delete(storedProject({ tags: [['public'], ['sysadmin']] }));

      expect(saved.tags).to.deep.equal([['sysadmin']]);
      expect(saved.isDeleted).to.equal(true);
    });

    it('should reject with code 400 on save failure', async () => {
      const row = storedProject({});
      row.save = sinon.stub().rejects(new Error('Database error'));

      try {
        await actions.delete(row);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.deep.equal({ code: 400, message: 'Database error' });
      }
    });
  });

  describe('sendResponse', () => {
    it('should call status with correct code', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponse(mockRes, 200, { data: 'test' });

      expect(mockRes.status.calledWith(200)).to.be.true;
    });

    it('should call json with the response object', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const testObject = { message: 'success', data: [1, 2, 3] };

      actions.sendResponse(mockRes, 200, testObject);

      expect(mockRes.json.calledWith(testObject)).to.be.true;
    });

    it('should handle error status codes', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponse(mockRes, 404, { error: 'Not Found' });

      expect(mockRes.status.calledWith(404)).to.be.true;
    });

    it('should chain status and json calls', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponse(mockRes, 201, {});

      expect(mockRes.status.calledBefore(mockRes.json)).to.be.true;
    });

    it('should handle various status codes', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponse(mockRes, 500, { error: 'Server Error' });
      expect(mockRes.status.calledWith(500)).to.be.true;

      actions.sendResponse(mockRes, 204, {});
      expect(mockRes.status.calledWith(204)).to.be.true;
    });

    describe('pending push fields', () => {
      const PENDING = { demiPushPending: true, demiPushFailedAt: new Date(), demiPushError: 'failed: connect ECONNREFUSED' };
      let mockRes;
      const sent = () => mockRes.json.firstCall.args[0];

      beforeEach(() => {
        mockRes = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      });

      it('leaves them out of a search page, its rows and their populated parents', () => {
        const parent = Object.assign({ _id: 'p1', name: 'Project' }, PENDING);
        const page = [{ searchResults: [Object.assign({ _id: 'd1', project: parent }, PENDING)], meta: [{ searchResultsTotal: 1 }] }];

        actions.sendResponse(mockRes, 200, page);

        expect(sent()).to.deep.equal([{ searchResults: [{ _id: 'd1', project: { _id: 'p1', name: 'Project' } }], meta: [{ searchResultsTotal: 1 }] }]);
        expect(page[0].searchResults[0]).to.include.keys('demiPushPending', 'demiPushError');
      });

      it('leaves them out of a populated parent that two rows share', () => {
        const parent = Object.assign({ _id: 'p1', name: 'Project' }, PENDING);
        const rows = [{ _id: 'd1', project: parent }, { _id: 'd2', project: parent }];

        actions.sendResponse(mockRes, 200, rows);

        expect(sent()).to.deep.equal([
          { _id: 'd1', project: { _id: 'p1', name: 'Project' } },
          { _id: 'd2', project: { _id: 'p1', name: 'Project' } }
        ]);
      });

      it('leaves them out of a document read by id, as its toJSON gives it', () => {
        const doc = { toJSON: () => Object.assign({ _id: OID, name: 'a' }, PENDING) };

        actions.sendResponse(mockRes, 200, [doc]);

        expect(sent()).to.deep.equal([{ _id: OID, name: 'a' }]);
      });

      it('passes a reply that carries none through as the same object', () => {
        const date = new Date();
        const rows = [{ _id: OID, when: date, tags: [['public']] }];

        actions.sendResponse(mockRes, 200, rows);

        expect(sent()).to.equal(rows);
        expect(sent()[0].when).to.equal(date);
      });
    });
  });

  describe('isPublished', () => {
    it('should return truthy value when object has public tag', async () => {
      const mockObject = {
        tags: [['public'], ['other']]
      };

      const result = await actions.isPublished(mockObject);
      
      expect(result).to.exist;
    });

    it('should return undefined when object does not have public tag', async () => {
      const mockObject = {
        tags: [['private'], ['internal']]
      };

      const result = await actions.isPublished(mockObject);
      
      expect(result).to.be.undefined;
    });

    it('should handle empty tags array', async () => {
      const mockObject = {
        tags: []
      };

      const result = await actions.isPublished(mockObject);

      expect(result).to.be.undefined;
    });
  });

  describe('sendMirrored', () => {
    let res;
    let errorLog;
    let Document;

    // Records what the client would receive.
    const fakeRes = () => {
      const sent = {};
      sent.status = code => { sent.code = code; return sent; };
      sent.json = body => { sent.body = body; return sent; };
      return sent;
    };

    // A push labelled the way demiPush labels the promises it hands back.
    const labelled = (value, reason) => Object.assign(Promise.resolve(value), { kind: 'documents', id: OID, outcome: { reason } });
    const setCall = () => Document.updateOne.getCalls().find(call => call.args[1].$set);
    const unsetCall = () => Document.updateOne.getCalls().find(call => call.args[1].$unset);

    beforeEach(() => {
      res = fakeRes();
      errorLog = sinon.stub(defaultLog, 'error');
      Document = { updateOne: sinon.stub().resolves({ matchedCount: 1 }), updateMany: sinon.stub().resolves({ matchedCount: 1 }) };
      sinon.stub(mongoose, 'model').withArgs('Document').returns(Document);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('answers the original code with the saved fields and mirrored true once the push landed', async () => {
      await actions.sendMirrored(res, 201, { _id: OID, name: 'a' }, labelled(true));

      expect(res.code).to.equal(201);
      expect(res.body).to.deep.equal({ _id: OID, name: 'a', mirrored: true });
      expect(setCall()).to.be.undefined;
    });

    it('clears the pending fields of a flagged row only where the failure predates the read by the clock-skew margin', async () => {
      const readAt = new Date('2026-10-01T00:00:00Z');
      const push = Object.assign(Promise.resolve(true), { kind: 'documents', id: OID, outcome: { reason: null, pending: true, readAt } });

      await actions.sendMirrored(res, 200, { _id: OID }, push);

      const [filter, update, options] = unsetCall().args;
      expect(filter).to.deep.equal({
        _id: OID,
        demiPushPending: true,
        $or: [{ demiPushFailedAt: { $lt: new Date('2026-09-30T23:59:55Z') } }, { demiPushFailedAt: { $exists: false } }]
      });
      expect(update.$unset).to.have.all.keys('demiPushPending', 'demiPushFailedAt', 'demiPushError');
      expect(options).to.deep.equal({ demiPushInternal: true });
    });

    it('writes nothing to a row that was not flagged when its push landed', async () => {
      await actions.sendMirrored(res, 200, { _id: OID }, labelled(true));

      expect(Document.updateOne.called).to.be.false;
    });

    it('leaves the pending fields out of the reply, so mirrored is the only push state a client sees', async () => {
      const saved = { _id: OID, name: 'a', demiPushPending: true, demiPushFailedAt: new Date(), demiPushError: 'timeout' };

      await actions.sendMirrored(res, 200, saved, labelled(true));

      expect(res.body).to.deep.equal({ _id: OID, name: 'a', mirrored: true });
    });

    it('leaves the pending fields out of a mongoose document reply', async () => {
      const doc = { toJSON: () => ({ _id: OID, demiPushPending: true, demiPushError: 'timeout' }) };

      await actions.sendMirrored(res, 200, doc, labelled(false));

      expect(res.body).to.deep.equal({ _id: OID, mirrored: false });
    });

    it('answers 200 with mirrored false and flags the row when the push was dropped', async () => {
      await actions.sendMirrored(res, 200, { _id: OID }, labelled(false));

      expect(res.code).to.equal(200);
      expect(res.body.mirrored).to.equal(false);
      const [filter, update] = setCall().args;
      expect(filter).to.deep.equal({ _id: OID });
      expect(update.$set.demiPushPending).to.equal(true);
      expect(update.$set.demiPushFailedAt).to.be.instanceOf(Date);
      expect(update.$set.demiPushError).to.equal('not mirrored (see push-dropped line)');
    });

    it('records PARENT_NOT_FOUND as the reason when DEMI lacked the parent', async () => {
      await actions.sendMirrored(res, 200, { _id: OID }, labelled(false, 'PARENT_NOT_FOUND'));

      expect(res.code).to.equal(200);
      expect(res.body.mirrored).to.equal(false);
      expect(setCall().args[1].$set.demiPushError).to.equal('PARENT_NOT_FOUND');
    });

    it('records a timeout when the push outlasts DEMI_PUSH_AWAIT_MS', async () => {
      const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const pending = Object.assign(new Promise(() => {}), { kind: 'documents', id: OID });

      const sent = actions.sendMirrored(res, 200, { _id: OID }, pending);
      await clock.tickAsync(25000);
      await sent;

      expect(res.code).to.equal(200);
      expect(res.body.mirrored).to.equal(false);
      expect(setCall().args[1].$set.demiPushError).to.equal('timeout');
    });

    it('logs one error per failed push naming kind, id and reason', async () => {
      await actions.sendMirrored(res, 200, {}, [labelled(false, 'PARENT_NOT_FOUND'), Promise.resolve(true)]);

      expect(errorLog.callCount).to.equal(1);
      expect(errorLog.firstCall.args[0]).to.include(`documents ${OID}`).and.include('PARENT_NOT_FOUND');
      expect(errorLog.firstCall.args[1]).to.deep.equal({ kind: 'documents', id: OID, reason: 'PARENT_NOT_FOUND' });
    });

    it('answers 200 with mirrored false and logs that no row is left after a hard delete', async () => {
      Document.updateOne.resolves({ matchedCount: 0 });

      await actions.sendMirrored(res, 200, {}, labelled(false));

      expect(res.code).to.equal(200);
      expect(res.body).to.deep.equal({ mirrored: false });
      expect(errorLog.calledWithMatch(/row gone/)).to.be.true;
    });

    it('answers 200 with mirrored false and logs the error when awaitMirror throws', async () => {
      sinon.stub(demiPush, 'awaitMirror').throws(new Error('boom'));

      await actions.sendMirrored(res, 200, {}, Promise.resolve(true));

      expect(res.code).to.equal(200);
      expect(res.body).to.deep.equal({ mirrored: false });
      expect(errorLog.calledWithMatch(sinon.match.string, { kind: 'unknown', id: 'unknown', reason: 'failed: boom' })).to.be.true;
    });

    it('answers the data with no mirrored key and no row write when the push was off', async () => {
      await actions.sendMirrored(res, 200, { _id: OID, name: 'a' }, Promise.resolve(true));

      expect(res.body).to.deep.equal({ _id: OID, name: 'a' });
      expect(Document.updateOne.called).to.be.false;
    });

    it('leaves the pending fields out of the reply when the push was off', async () => {
      const saved = { _id: OID, name: 'a', demiPushPending: true, demiPushFailedAt: new Date(), demiPushError: 'timeout' };

      await actions.sendMirrored(res, 200, saved, Promise.resolve(true));

      expect(res.body).to.deep.equal({ _id: OID, name: 'a' });
    });

    it('leaves the pending fields out of a mongoose document reply when the push was off', async () => {
      const doc = { toJSON: () => ({ _id: OID, demiPushPending: true, demiPushError: 'timeout' }) };

      await actions.sendMirrored(res, 200, doc, Promise.resolve(true));

      expect(res.body).to.deep.equal({ _id: OID });
    });

    it('answers mirrored false for a push with no label, without trying to flag a row it cannot name', async () => {
      await actions.sendMirrored(res, 200, { _id: OID }, Promise.resolve(false));

      expect(res.body).to.deep.equal({ _id: OID, mirrored: false });
      expect(Document.updateOne.called).to.be.false;
      expect(errorLog.called).to.be.false;
    });

    it('sends a mongoose document as its JSON plus mirrored, leaving the document itself alone', async () => {
      const doc = { _id: OID, toJSON: () => ({ _id: OID, name: 'json' }) };

      await actions.sendMirrored(res, 200, doc, labelled(true));

      expect(res.body).to.deep.equal({ _id: OID, name: 'json', mirrored: true });
      expect(doc).to.not.have.property('mirrored');
    });

    it('keeps an array body as it is', async () => {
      const rows = [{ _id: OID }];

      await actions.sendMirrored(res, 200, rows, labelled(true));

      expect(res.body).to.equal(rows);
    });

    it('replies through exports.sendResponse so a stub on the module sees it', async () => {
      const send = sinon.stub(actions, 'sendResponse');

      await actions.sendMirrored(res, 200, { _id: OID }, Promise.resolve(true));

      expect(send.calledOnceWithExactly(res, 200, { _id: OID })).to.be.true;
    });

    it('logs and sends nothing more when the reply throws after headers went out', async () => {
      const status = sinon.stub().throws(new Error('headers already sent'));
      res.status = status;
      res.headersSent = true;

      await actions.sendMirrored(res, 200, {}, Promise.resolve(true));

      expect(errorLog.firstCall.args[0]).to.include('headers already sent');
      expect(status.calledOnce).to.be.true;
    });

    it('answers 500 once when the body cannot be serialized', async () => {
      res.json = body => { res.body = JSON.parse(JSON.stringify(body)); return res; };
      const send = sinon.spy(actions, 'sendResponse');
      const circular = { _id: 'd1' };
      circular.self = circular;

      await actions.sendMirrored(res, 200, circular, Promise.resolve(true));

      expect(send.getCalls().filter(call => call.args[1] === 500)).to.have.lengthOf(1);
      expect(res.code).to.equal(500);
      expect(res.body).to.deep.equal({ message: 'Could not send the reply.' });
      expect(errorLog.firstCall.args[0]).to.include('circular');
    });

    [null, undefined].forEach(none => {
      it(`answers normally when the write had no push to wait for (${none})`, async () => {
        await actions.sendMirrored(res, 200, { ok: 1 }, none);

        expect(res.code).to.equal(200);
        expect(res.body).to.deep.equal({ ok: 1 });
      });

      it(`logs no mirrored line when the write had no push to wait for (${none})`, async () => {
        const infoLog = sinon.stub(defaultLog, 'info');

        await actions.sendMirrored(res, 200, { ok: 1 }, none);

        expect(infoLog.called).to.be.false;
      });
    });

    describe('mirrored log line', () => {
      let infoLog;
      const push = (kind, id) => Object.assign(Promise.resolve(true), { kind, id });

      beforeEach(() => {
        infoLog = sinon.stub(defaultLog, 'info');
      });

      it('logs one info line naming kind and id when one push landed', async () => {
        await actions.sendMirrored(res, 200, {}, push('document', 'd1'));

        expect(infoLog.calledOnce).to.be.true;
        expect(infoLog.firstCall.args[0]).to.equal('[demiPush] mirrored document d1');
        expect(infoLog.firstCall.args[1]).to.deep.equal({ kind: 'document', id: 'd1' });
      });

      it('logs one info line per landed push, in order', async () => {
        await actions.sendMirrored(res, 200, {}, [push('organization', 'o1'), push('users', 'org:o1')]);

        expect(infoLog.args.map(args => args[0])).to.deep.equal([
          '[demiPush] mirrored organization o1',
          '[demiPush] mirrored users org:o1'
        ]);
      });

      it('logs no info line when a push failed', async () => {
        await actions.sendMirrored(res, 200, { _id: OID }, labelled(false));

        expect(res.body.mirrored).to.equal(false);
        expect(infoLog.called).to.be.false;
      });

      it('logs nothing for a value that is not a labelled push', async () => {
        await actions.sendMirrored(res, 200, {}, Promise.resolve(true));

        expect(res.code).to.equal(200);
        expect(infoLog.called).to.be.false;
      });
    });
  });
});
