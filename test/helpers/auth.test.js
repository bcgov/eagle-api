/**
 * Unit Tests for Auth Helper
 * 
 * Testing JWT authentication and user management
 */

const { expect } = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt-nodejs');
const mongoose = require('mongoose');

describe('Auth Helper Functions', () => {
  let auth;
  let sandbox;

  before(() => {
    // Set test environment variables
    process.env.SECRET = 'testSecret';
    process.env.JWT_SIGN_EXPIRY = '60';
    process.env.KEYCLOAK_ENABLED = 'false';
    
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
});
