/**
 * Unit tests for scripts/dedupe-project-pins.js. The query and the write run against a real MongoDB
 * in test/db/projectPins.test.js.
 */

const childProcess = require('child_process');
const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const { dedupePins, parseArgs, validate } = require('../../scripts/dedupe-project-pins');
const demiPush = require('../../api/helpers/demiPush');

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

  describe('validate', () => {
    afterEach(() => sinon.restore());

    it('stops --apply when DEMI is not configured', () => {
      sinon.stub(demiPush, 'configured').returns(false);

      expect(validate(parseArgs(['--apply']))).to.contain('DEMI pushes are off');
    });

    it('lets a dry run go ahead when DEMI is not configured', () => {
      sinon.stub(demiPush, 'configured').returns(false);

      expect(validate(parseArgs([]))).to.be.null;
    });

    it('lets --apply go ahead when DEMI is configured', () => {
      sinon.stub(demiPush, 'configured').returns(true);

      expect(validate(parseArgs(['--apply']))).to.be.null;
    });
  });

  describe('command line', () => {
    const SCRIPT = path.join(__dirname, '../../scripts/dedupe-project-pins.js');

    it('exits 2 on --apply without DEMI settings, before it connects to Mongo', () => {
      // Port 9 is discard: had the run gone on to connect, it would hang past the timeout, not exit 2.
      const env = Object.assign({}, process.env, { MONGODB_SERVICE_HOST: '127.0.0.1', MONGODB_PORT: '9' });
      delete env.DEMI_API_BASE;
      delete env.DEMI_APIM_KEY;

      const result = childProcess.spawnSync(process.execPath, [SCRIPT, '--apply'], { env, encoding: 'utf8', timeout: 5000 });

      expect(result.status).to.equal(2);
      expect(result.stderr).to.contain('DEMI pushes are off');
    });
  });
});
