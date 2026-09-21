/**
 * Unit Tests for Auth Helper
 * 
 * Testing JWT authentication and user management
 */

const { expect } = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

describe('Auth Helper Functions', () => {
  let auth;
  let sandbox;

  before(() => {
    // Set test environment variables
    process.env.SECRET = 'testSecret';
    process.env.JWT_SIGN_EXPIRY = '60';
    process.env.KEYCLOAK_ENABLED = 'false';

    // auth.js snapshots SECRET and KEYCLOAK_ENABLED at module load, so it has to be loaded
    // fresh here — another test file requiring it first would otherwise cache the defaults.
    delete require.cache[require.resolve('../../api/helpers/auth')];
    auth = require('../../api/helpers/auth');
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('issueToken', () => {
    it('should generate valid JWT with required user data', () => {
      const user = { _id: 'user123', username: 'testuser' };
      const token = auth.issueToken(user, 'device123', ['public']);
      const decoded = jwt.verify(token, process.env.SECRET);

      expect(decoded.userID).to.equal('user123');
      expect(decoded.preferred_username).to.equal('testuser');
      expect(decoded.deviceId).to.equal('device123');
      expect(decoded.realm_access.roles).to.include('public');
      expect(decoded.exp).to.be.a('number');
    });

    it('should include multiple scopes in token', () => {
      const user = { _id: 'user123', username: 'testuser' };
      const token = auth.issueToken(user, 'device123', ['public', 'staff', 'admin']);
      const decoded = jwt.decode(token);

      expect(decoded.realm_access.roles).to.have.lengthOf(3);
      expect(decoded.realm_access.roles).to.include.members(['public', 'staff', 'admin']);
    });
  });

  describe('setPassword', () => {
    it('should hash password with unique salt', () => {
      const user1 = { password: 'samePassword' };
      const user2 = { password: 'samePassword' };

      auth.setPassword(user1);
      auth.setPassword(user2);

      expect(user1.password).to.not.equal('samePassword');
      expect(user1.password).to.not.equal(user2.password);
      expect(user1.salt).to.not.equal(user2.salt);
    });
  });

  // checkAuthentication requires database access and is better tested in integration tests

  describe('Token Security', () => {
    it('should verify tokens with correct secret and reject with wrong secret', () => {
      const user = { _id: 'user123', username: 'testuser' };
      const token = auth.issueToken(user, 'device123', ['public']);

      expect(() => jwt.verify(token, process.env.SECRET)).to.not.throw();
      expect(() => jwt.verify(token, 'wrongSecret')).to.throw();
    });

    it('should verify password hash correctly using pbkdf2', () => {
      const crypto = require('crypto');
      const plainPassword = 'mySecurePassword';
      const user = { password: plainPassword };
      
      auth.setPassword(user);

      const rehashed = crypto.pbkdf2Sync(plainPassword, Buffer.from(user.salt, 'base64'), 10000, 64, 'sha1').toString('base64');
      const wrongHash = crypto.pbkdf2Sync('wrongPassword', Buffer.from(user.salt, 'base64'), 10000, 64, 'sha1').toString('base64');

      expect(user.password).to.equal(rehashed);
      expect(user.password).to.not.equal(wrongHash);
    });

    it('should generate unique JTI and proper JWT claims', () => {
      const user = { _id: 'user123', username: 'testuser' };
      const token1 = auth.issueToken(user, 'device1', ['public']);
      const token2 = auth.issueToken(user, 'device1', ['public']);
      
      const decoded1 = jwt.decode(token1);
      const decoded2 = jwt.decode(token2);

      expect(decoded1.jti).to.not.equal(decoded2.jti);
      expect(decoded1).to.have.property('iat');
      expect(decoded1).to.have.property('exp');
      expect(decoded1).to.have.property('iss');
    });
  });

  describe('verifyToken', () => {
    let mockReq;
    let resJson;
    let resStatus;

    beforeEach(() => {
      resJson = sandbox.spy();
      resStatus = sandbox.stub().returns({ json: resJson });
      mockReq = {
        method: 'GET',
        res: {
          status: resStatus
        },
        swagger: {
          operation: {
            'x-security-scopes': []
          },
          params: {}
        }
      };
    });

    it('should allow public tokens for public operations', (done) => {
      const user = { _id: 'user123', username: 'testuser' };
      const token = 'Bearer ' + auth.issueToken(user, 'dev', ['public']);
      mockReq.swagger.operation['x-security-scopes'] = ['public'];

      auth.verifyToken(mockReq, {}, token, (err) => {
        expect(err).to.be.null;
        expect(mockReq.swagger.params.auth_payload.realm_access.roles).to.include('public');
        done();
      });
    });

    it('should deny token missing required scope', (done) => {
      const user = { _id: 'user123', username: 'testuser' };
      const token = 'Bearer ' + auth.issueToken(user, 'dev', ['public']);
      mockReq.swagger.operation['x-security-scopes'] = ['sysadmin'];

      auth.verifyToken(mockReq, {}, token, (err) => {
        expect(err).to.not.be.null;
        expect(resStatus.calledWith(403)).to.be.true;
        done();
      });
    });

    describe('no bearer', () => {
      const noBearer = (apiPath, method, operation) => {
        mockReq.swagger.apiPath = apiPath;
        mockReq.swagger.operationPath = ['paths', apiPath, method];
        mockReq.swagger.operation = { 'x-security-scopes': [], ...operation };
      };

      it('refuses a GET on a route that does not declare anonymous read', (done) => {
        noBearer('/vc', 'get', {});
        auth.verifyToken(mockReq, {}, '', () => {
          expect(resStatus.calledWith(403)).to.be.true;
          expect(mockReq.swagger.params.auth_payload).to.be.undefined;
          done();
        });
      });

      it('allows a GET that declares anonymous read', (done) => {
        noBearer('/search', 'get', { 'x-anonymous-read': true });
        auth.verifyToken(mockReq, {}, '', (err) => {
          expect(err).to.be.null;
          expect(resStatus.called).to.be.false;
          expect(mockReq.swagger.params.auth_payload.realm_access.roles).to.eql(['public']);
          done();
        });
      });

      it('allows anything under /public', (done) => {
        noBearer('/public/comment', 'get', {});
        auth.verifyToken(mockReq, {}, '', (err) => {
          expect(err).to.be.null;
          expect(mockReq.swagger.params.auth_payload.preferred_username).to.equal('public');
          done();
        });
      });

      it('refuses a write on a protected route', (done) => {
        noBearer('/search', 'post', {});
        auth.verifyToken(mockReq, {}, '', () => {
          expect(resStatus.calledWith(403)).to.be.true;
          done();
        });
      });
    });

    it('should handle malformed token without crashing', (done) => {
      auth.verifyToken(mockReq, {}, 'Bearer invalid-token-string', (err) => {
        expect(err).to.not.be.null;
        expect(resStatus.calledWith(403)).to.be.true;
        done();
      });
    });

    it('should validate x-api-key and set trimmed roles', (done) => {
      process.env.INTERNAL_API_KEY = 'testApiKey123';
      mockReq.headers = { 'x-api-key': 'testApiKey123' };

      auth.verifyToken(mockReq, {}, null, (err) => {
        expect(err).to.be.null;
        const roles = mockReq.swagger.params.auth_payload.realm_access.roles;
        expect(roles).to.include('project-admin-staff');
        expect(roles).to.not.include('sysadmin');
        delete process.env.INTERNAL_API_KEY;
        done();
      });
    });

    describe('x-api-key route scopes', () => {
      beforeEach(() => {
        process.env.INTERNAL_API_KEY = 'testApiKey123';
        mockReq.headers = { 'x-api-key': 'testApiKey123' };
      });

      afterEach(() => {
        delete process.env.INTERNAL_API_KEY;
      });

      [['project-system-admin'], ['sysadmin'], ['project-system-admin', 'sysadmin']].forEach((scopes) => {
        it(`refuses a route scoped to ${scopes.join(', ')}`, (done) => {
          mockReq.swagger.operation['x-security-scopes'] = scopes;
          auth.verifyToken(mockReq, {}, null, () => {
            expect(resStatus.calledWith(403)).to.be.true;
            expect(mockReq.swagger.params.auth_payload).to.be.undefined;
            done();
          });
        });
      });

      ['PUT', 'POST', 'DELETE'].forEach((method) => {
        it(`refuses a ${method} on a staff route`, (done) => {
          mockReq.method = method;
          mockReq.swagger.operation['x-security-scopes'] = ['staff', 'sysadmin'];
          auth.verifyToken(mockReq, {}, null, () => {
            expect(resStatus.calledWith(403)).to.be.true;
            expect(mockReq.swagger.params.auth_payload).to.be.undefined;
            done();
          });
        });
      });

      it('refuses a PUT on a route with no scopes', (done) => {
        mockReq.method = 'PUT';
        auth.verifyToken(mockReq, {}, null, () => {
          expect(resStatus.calledWith(403)).to.be.true;
          done();
        });
      });

      it('passes a GET on a route with no scopes', (done) => {
        auth.verifyToken(mockReq, {}, null, (err) => {
          expect(err).to.be.null;
          expect(resStatus.called).to.be.false;
          done();
        });
      });

      it('passes a HEAD on a staff route', (done) => {
        mockReq.method = 'HEAD';
        mockReq.swagger.operation['x-security-scopes'] = ['staff', 'sysadmin'];
        auth.verifyToken(mockReq, {}, null, (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('passes a GET on a staff route without adding staff to the request roles', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['staff', 'sysadmin'];
        auth.verifyToken(mockReq, {}, null, (err) => {
          expect(err).to.be.null;
          expect(resStatus.called).to.be.false;
          // read[] filtering uses these roles, so staff-only documents stay hidden from the key.
          expect(mockReq.swagger.params.auth_payload.realm_access.roles)
            .to.eql(['project-admin-staff', 'project-team', 'public']);
          done();
        });
      });
    });

    describe('JWT route scopes', () => {
      const bearer = (roles) => 'Bearer ' + auth.issueToken({ _id: 'u1', username: 'u1' }, 'dev', roles);

      it('lets a staff token through a project-system-admin route', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['project-system-admin'];
        auth.verifyToken(mockReq, {}, bearer(['staff']), (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('lets a sysadmin token through a staff route', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['staff'];
        auth.verifyToken(mockReq, {}, bearer(['sysadmin']), (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('lets a staff token through the project-system-admin, sysadmin pair', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['project-system-admin', 'sysadmin'];
        auth.verifyToken(mockReq, {}, bearer(['staff']), (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('refuses a public token on the project-system-admin, sysadmin pair', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['project-system-admin', 'sysadmin'];
        auth.verifyToken(mockReq, {}, bearer(['public']), () => {
          expect(resStatus.calledWith(403)).to.be.true;
          done();
        });
      });

      it('lets a public token through a route with no scopes', (done) => {
        auth.verifyToken(mockReq, {}, bearer(['public']), (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('lets a token holding the route scope through', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['project-system-admin'];
        auth.verifyToken(mockReq, {}, bearer(['project-system-admin']), (err) => {
          expect(err).to.be.null;
          done();
        });
      });

      it('refuses the key roles when sent as a token on a staff route', (done) => {
        mockReq.swagger.operation['x-security-scopes'] = ['staff', 'sysadmin'];
        auth.verifyToken(mockReq, {}, bearer(['project-admin-staff', 'project-team', 'public']), () => {
          expect(resStatus.calledWith(403)).to.be.true;
          done();
        });
      });
    });
  });
});
