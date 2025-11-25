/**
 * Simple Test Setup
 * 
 * Minimal test configuration for unit tests
 */

const chai = require('chai');

// Make expect available globally
global.expect = chai.expect;

// Export for direct use if needed
module.exports = {
  chai,
  expect: chai.expect
};
