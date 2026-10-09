/**
 * worker/demi-push-sweep.js, the CronJob entrypoint: its exit code tells the CronJob whether a kind
 * could not be read, and the unsent-push summary is logged before the process ends.
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const appHelper = require('../../app_helper');
const pushClient = require('../../api/helpers/pushClient');
const demiPushSweep = require('../../api/helpers/demiPushSweep');

const WORKER = require.resolve('../../worker/demi-push-sweep');

describe('demi-push-sweep worker', () => {
  let listeners;

  beforeEach(() => {
    listeners = process.listeners('unhandledRejection');
    sinon.stub(appHelper, 'loadMongoose').resolves();
    sinon.stub(pushClient, 'logUnsent');
  });

  afterEach(() => {
    sinon.restore();
    delete require.cache[WORKER];
    // The worker registers its own handler on load; drop it so it does not outlive the test.
    process.listeners('unhandledRejection').filter(fn => !listeners.includes(fn))
      .forEach(fn => process.removeListener('unhandledRejection', fn));
  });

  // Loads the worker, which runs at once, and resolves with the code it exits with.
  const runWorker = () => {
    const exited = new Promise(resolve => sinon.stub(process, 'exit').callsFake(resolve));
    delete require.cache[WORKER];
    require(WORKER);
    return exited;
  };

  it('exits 1 when the pending rows of a kind could not be read', async () => {
    sinon.stub(demiPushSweep, 'sweep').resolves({ project: { found: 0, pushed: 0, failed: 0 }, document: { found: 0, pushed: 0, failed: 0, unreadable: true } });

    expect(await runWorker()).to.equal(1);
  });

  it('exits 0 when every kind was read, even with pushes that failed again', async () => {
    sinon.stub(demiPushSweep, 'sweep').resolves({ project: { found: 2, pushed: 1, failed: 1 } });

    expect(await runWorker()).to.equal(0);
  });

  it('logs the unsent pushes before it exits', async () => {
    sinon.stub(demiPushSweep, 'sweep').resolves({ project: { found: 1, pushed: 1, failed: 0 } });

    await runWorker();

    expect(pushClient.logUnsent.calledOnce).to.be.true;
    expect(pushClient.logUnsent.calledBefore(process.exit)).to.be.true;
  });
});
