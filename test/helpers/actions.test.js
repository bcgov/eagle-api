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
const { NOT_MIRRORED } = require('../support/demiPushHarness');
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

    // Records what the client would receive.
    const fakeRes = () => {
      const sent = {};
      sent.status = code => { sent.code = code; return sent; };
      sent.json = body => { sent.body = body; return sent; };
      return sent;
    };

    beforeEach(() => {
      res = fakeRes();
      errorLog = sinon.stub(defaultLog, 'error');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('answers with the original code and data once the push landed', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({ mirrored: true, failures: [] });
      const doc = { _id: 'd1' };

      await actions.sendMirrored(res, 201, doc, Promise.resolve(true));

      expect(res.code).to.equal(201);
      expect(res.body).to.equal(doc);
    });

    it('replies through exports.sendResponse so a stub on the module sees it', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({ mirrored: true, failures: [] });
      const send = sinon.stub(actions, 'sendResponse');
      const doc = { _id: 'd1' };

      await actions.sendMirrored(res, 200, doc, Promise.resolve(true));

      expect(send.calledOnceWithExactly(res, 200, doc)).to.be.true;
    });

    it('answers 502 with the NOT_MIRRORED body when a push failed', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({
        mirrored: false, failures: [{ kind: 'document', id: 'd1', reason: 'timeout' }]
      });

      await actions.sendMirrored(res, 200, { _id: 'd1' }, Promise.resolve(false));

      expect(res.code).to.equal(502);
      expect(res.body).to.deep.equal(NOT_MIRRORED);
    });

    it('logs one error per failed push naming kind, id and reason', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({
        mirrored: false,
        failures: [
          { kind: 'document', id: 'd1', reason: 'timeout' },
          { kind: 'project', id: 'p1', reason: 'parked: parent not in DEMI yet' }
        ]
      });

      await actions.sendMirrored(res, 200, {}, [Promise.resolve(false), Promise.resolve(false)]);

      expect(errorLog.callCount).to.equal(2);
      expect(errorLog.secondCall.args[0]).to.include('project p1').and.include('parked: parent not in DEMI yet');
      expect(errorLog.secondCall.args[1]).to.deep.equal({ kind: 'project', id: 'p1', reason: 'parked: parent not in DEMI yet' });
    });

    it('resolves with a 502 and logs the error when awaitMirror throws', async () => {
      sinon.stub(demiPush, 'awaitMirror').throws(new Error('boom'));

      await actions.sendMirrored(res, 200, {}, Promise.resolve(true));

      expect(res.code).to.equal(502);
      expect(errorLog.calledOnce).to.be.true;
      expect(errorLog.firstCall.args[1]).to.deep.equal({ kind: 'unknown', id: 'unknown', reason: 'failed: boom' });
    });

    it('logs and sends nothing more when the reply throws after headers went out', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({ mirrored: true, failures: [] });
      const status = sinon.stub().throws(new Error('headers already sent'));
      res.status = status;
      res.headersSent = true;

      await actions.sendMirrored(res, 200, {}, Promise.resolve(true));

      expect(errorLog.firstCall.args[0]).to.include('headers already sent');
      expect(status.calledOnce).to.be.true;
    });

    it('answers 500 once when the body cannot be serialized', async () => {
      sinon.stub(demiPush, 'awaitMirror').resolves({ mirrored: true, failures: [] });
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
        expect(await demiPush.awaitMirror(none)).to.deep.equal({ mirrored: true, failures: [] });

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
        const failed = Object.assign(Promise.resolve(false), { kind: 'document', id: 'd1' });

        await actions.sendMirrored(res, 200, {}, failed);

        expect(res.code).to.equal(502);
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
