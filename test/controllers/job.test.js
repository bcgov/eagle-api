const { expect } = require('chai');
const sinon = require('sinon');

const jobQueue = require('../../api/helpers/jobQueue');

const JOB = require.resolve('../../api/controllers/job');
const JOB_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const CSV = 'name,url\nreport.pdf,https://x\n';

const staff = sub => ({ sub, preferred_username: sub + '-login', realm_access: { roles: ['staff'] } });
const sysadmin = sub => ({ sub, preferred_username: sub + '-login', realm_access: { roles: ['sysadmin'] } });

// A finished export queued by the user whose Keycloak sub is "owner".
const finishedExport = () => ({
  attrs: {
    _id: JOB_ID,
    name: 'project-doc-export',
    lastFinishedAt: new Date('2026-10-01T00:00:00Z'),
    data: { requestedBy: 'owner', result: { csv: CSV, filename: 'export.csv' } }
  }
});

describe('job routes: owner or sysadmin only', () => {
  let job;
  let res;

  beforeEach(() => {
    // job.js destructures getAgenda on load, so stub first and load it fresh.
    sinon.stub(jobQueue, 'getAgenda').returns({ jobs: sinon.stub().resolves([finishedExport()]) });
    delete require.cache[JOB];
    job = require(JOB);
    res = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub(), setHeader: sinon.stub() };
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[JOB];
  });

  const args = auth_payload => ({ swagger: { params: { auth_payload, jobId: { value: JOB_ID } } } });

  [
    ['getJobStatus', r => r.json.calledWithMatch({ jobId: JOB_ID, status: 'completed' })],
    ['downloadJobResult', r => r.send.calledWith(CSV)]
  ].forEach(([handler, delivered]) => {
    it(`${handler} answers 404 to a staff user who did not queue the job`, async () => {
      await job[handler](args(staff('someone-else')), res);

      expect(res.status.calledWith(404)).to.be.true;
      expect(delivered(res)).to.be.false;
    });

    it(`${handler} gives the job to the staff user who queued it`, async () => {
      await job[handler](args(staff('owner')), res);

      expect(delivered(res)).to.be.true;
    });

    it(`${handler} gives the job to a sysadmin who did not queue it`, async () => {
      await job[handler](args(sysadmin('admin')), res);

      expect(delivered(res)).to.be.true;
    });
  });
});
