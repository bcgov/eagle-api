/**
 * Unit Tests for API Helpers - Actions
 * 
 * Testing action functions for publish/unpublish operations
 */

const { expect } = require('chai');
const sinon = require('sinon');
const actions = require('../../api/helpers/actions');

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
  });

  describe('delete', () => {
    it('should set isDeleted to true', async () => {
      const mockObject = {
        tags: [['public']],
        isDeleted: false,
        markModified: sinon.stub(),
        save: sinon.stub().resolves({ isDeleted: true })
      };

      await actions.delete(mockObject);
      
      expect(mockObject.isDeleted).to.be.true;
    });

    it('should call markModified for tags and isDeleted', async () => {
      const mockObject = {
        tags: [],
        isDeleted: false,
        markModified: sinon.stub(),
        save: sinon.stub().resolves()
      };

      await actions.delete(mockObject);
      
      expect(mockObject.markModified.calledWith('tags')).to.be.true;
      expect(mockObject.markModified.calledWith('isDeleted')).to.be.true;
    });

    it('should call save', async () => {
      const mockObject = {
        tags: [],
        isDeleted: false,
        markModified: sinon.stub(),
        save: sinon.stub().resolves()
      };

      await actions.delete(mockObject);
      
      expect(mockObject.save.calledOnce).to.be.true;
    });

    it('should reject with error message on save failure', async () => {
      const mockObject = {
        tags: [],
        isDeleted: false,
        markModified: sinon.stub(),
        save: sinon.stub().rejects(new Error('Database error'))
      };

      try {
        await actions.delete(mockObject);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.have.property('code', 400);
        expect(error).to.have.property('message');
      }
    });
  });

  describe('sendResponse', () => {
    it('should write correct status code', () => {
      const mockRes = {
        writeHead: sinon.stub(),
        end: sinon.stub()
      };

      actions.sendResponse(mockRes, 200, { data: 'test' });
      
      expect(mockRes.writeHead.calledWith(200, { 'Content-Type': 'application/json' })).to.be.true;
    });

    it('should send JSON stringified object', () => {
      const mockRes = {
        writeHead: sinon.stub(),
        end: sinon.stub()
      };
      const testObject = { message: 'success', data: [1, 2, 3] };

      actions.sendResponse(mockRes, 200, testObject);
      
      expect(mockRes.end.calledWith(JSON.stringify(testObject))).to.be.true;
    });

    it('should handle error status codes', () => {
      const mockRes = {
        writeHead: sinon.stub(),
        end: sinon.stub()
      };

      actions.sendResponse(mockRes, 404, { error: 'Not Found' });
      
      expect(mockRes.writeHead.calledWith(404)).to.be.true;
    });

    it('should set Content-Type header', () => {
      const mockRes = {
        writeHead: sinon.stub(),
        end: sinon.stub()
      };

      actions.sendResponse(mockRes, 201, {});
      
      const headersArg = mockRes.writeHead.getCall(0).args[1];
      expect(headersArg['Content-Type']).to.equal('application/json');
    });
  });

  describe('sendResponseV2', () => {
    it('should call status with correct code', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponseV2(mockRes, 200, { data: 'test' });
      
      expect(mockRes.status.calledWith(200)).to.be.true;
    });

    it('should call json with object', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };
      const testObject = { message: 'created' };

      actions.sendResponseV2(mockRes, 201, testObject);
      
      expect(mockRes.json.calledWith(testObject)).to.be.true;
    });

    it('should chain status and json calls', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponseV2(mockRes, 404, { error: 'Not Found' });
      
      expect(mockRes.status.calledBefore(mockRes.json)).to.be.true;
    });

    it('should handle various status codes', () => {
      const mockRes = {
        status: sinon.stub().returnsThis(),
        json: sinon.stub()
      };

      actions.sendResponseV2(mockRes, 500, { error: 'Server Error' });
      expect(mockRes.status.calledWith(500)).to.be.true;

      actions.sendResponseV2(mockRes, 204, {});
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
});
