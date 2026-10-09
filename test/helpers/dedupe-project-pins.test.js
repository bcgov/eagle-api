/**
 * Unit tests for scripts/dedupe-project-pins.js. The query and the write run against a real MongoDB
 * in test/db/projectPins.test.js.
 */

const { expect } = require('chai');
const mongoose = require('mongoose');

const { dedupePins, parseArgs } = require('../../scripts/dedupe-project-pins');

describe('dedupe-project-pins script', () => {
  const A = '5f4c7d1e2b3a4c5d6e7f0a01';
  const B = '5f4c7d1e2b3a4c5d6e7f0a02';
  const C = '5f4c7d1e2b3a4c5d6e7f0a03';
  const oid = hex => new mongoose.Types.ObjectId(hex);

  describe('dedupePins', () => {
    it('keeps each id once, where it first appears', () => {
      expect(dedupePins([oid(B), oid(A), oid(B), oid(C), oid(A)])).to.deep.equal([B, A, C]);
    });

    it('leaves a list with no repeats as it was', () => {
      expect(dedupePins([oid(C), oid(A)])).to.deep.equal([C, A]);
    });
  });

  describe('parseArgs', () => {
    it('is a dry run unless --apply is given', () => {
      expect(parseArgs([]).apply).to.be.false;
    });

    it('reports an argument it does not know', () => {
      expect(parseArgs(['--apply', '--live']).unknown).to.deep.equal(['--live']);
    });
  });
});
