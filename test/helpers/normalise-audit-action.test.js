const { expect } = require('chai');
const sinon = require('sinon');
const winston = require('winston');

const { backfill, parseArgs } = require('../../scripts/normalise-audit-action');

function auditStub(distinctValues) {
  return {
    distinct: sinon.stub().resolves(distinctValues),
    countDocuments: sinon.stub().resolves(7),
    updateMany: sinon.stub().resolves({ matchedCount: 7, modifiedCount: 7 })
  };
}

describe('normalise-audit-action backfill', () => {
  // The script registers its own console logger on require; keep its output out of the test run.
  beforeEach(() => sinon.stub(winston.loggers.get('default'), 'info'));
  afterEach(() => sinon.restore());

  it('rewrites only the distinct values that differ from their lowercase form', async () => {
    const audit = auditStub(['get', 'Get', 'Put', 'search']);

    await backfill(audit, false);

    expect(audit.updateMany.firstCall.args[0]).to.deep.equal({ action: { $in: ['Get', 'Put'] } });
  });

  it('ignores non-string action values, which have no lowercase form', async () => {
    const audit = auditStub([null, 42, 'Get']);

    await backfill(audit, false);

    expect(audit.updateMany.firstCall.args[0]).to.deep.equal({ action: { $in: ['Get'] } });
  });

  it('lowercases with an update pipeline, so one pass covers every matched value', async () => {
    const audit = auditStub(['Get']);

    await backfill(audit, false);

    expect(audit.updateMany.firstCall.args[1]).to.deep.equal([{ $set: { action: { $toLower: '$action' } } }]);
  });

  it('writes nothing when every value is already lowercase, so re-running is free', async () => {
    const audit = auditStub(['get', 'put']);

    await backfill(audit, false);

    expect(audit.updateMany.called).to.equal(false);
  });

  it('counts instead of writing on a dry run', async () => {
    const audit = auditStub(['Get']);

    await backfill(audit, true);

    expect(audit.updateMany.called).to.equal(false);
    expect(audit.countDocuments.firstCall.args[0]).to.deep.equal({ action: { $in: ['Get'] } });
  });
});

describe('normalise-audit-action argument parsing', () => {
  it('takes --dry-run', () => {
    expect(parseArgs(['--dry-run'])).to.deep.equal({ help: false, dryRun: true, unknown: [] });
  });

  it('reports any other argument as unknown, so the script exits non-zero', () => {
    expect(parseArgs(['--bogus']).unknown).to.deep.equal(['--bogus']);
  });

  it('treats --help and -h as help', () => {
    expect(parseArgs(['--help']).help).to.equal(true);
    expect(parseArgs(['-h']).help).to.equal(true);
  });
});
