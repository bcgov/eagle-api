/**
 * Extension/suspension handlers: DEMI push by id after a matched write.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

const Actions = require('../../api/helpers/actions');
const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');
const projectController = require('../../api/controllers/project');

const PROJ_ID = '5f4c7d1e2b3a4c5d6e7f8091';
const EXTENSION = { type: 'Extension', start: '2026-01-01' };
const MATCHED = { acknowledged: true, matchedCount: 1, modifiedCount: 1 };

describe('Project Extension Handlers', () => {
  let res, projectModel;

  function makeArgs(extra) {
    return {
      swagger: {
        params: Object.assign({
          projId: { value: PROJ_ID },
          auth_payload: { preferred_username: 'tester' }
        }, extra)
      }
    };
  }

  const addArgs = () => makeArgs({ extension: { value: EXTENSION } });
  const deleteArgs = () => makeArgs({ item: { value: JSON.stringify(EXTENSION) } });
  const updateArgs = () => makeArgs({
    extension: { value: { old: EXTENSION, new: { type: 'Suspension' } } }
  });

  beforeEach(() => {
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    projectModel = { updateOne: sinon.stub().resolves(MATCHED) };

    sinon.stub(mongoose, 'model').callsFake(name => (name === 'Project' ? projectModel : {}));
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(demiPush, 'project').resolves(true);
  });

  afterEach(() => sinon.restore());

  [
    ['protectedExtensionAdd', addArgs],
    ['protectedExtensionDelete', deleteArgs],
    ['protectedExtensionUpdate', updateArgs]
  ].forEach(([handler, args]) => {
    describe(handler, () => {
      it('pushes the project by id for DEMI to re-read and returns the write result', async () => {
        await projectController[handler](args(), res);

        expect(res.status.args).to.deep.equal([[200]]);
        expect(res.json.firstCall.args[0]).to.equal(MATCHED);
        expect(demiPush.project.calledOnce).to.be.true;
        expect(demiPush.project.firstCall.args[0]).to.deep.equal({ _id: PROJ_ID });
      });

      // An unacknowledged write carries no counts, so there is no matched row to push.
      it('does not push when the write reports no match', async () => {
        projectModel.updateOne.resolves({ acknowledged: false });

        await projectController[handler](args(), res);

        expect(res.status.args).to.deep.equal([[200]]);
        expect(demiPush.project.called).to.be.false;
      });

      it('answers 502 NOT_MIRRORED when the push does not land', async () => {
        demiPush.project.resolves(false);

        await projectController[handler](args(), res);

        expect(res.status.args).to.deep.equal([[502]]);
        expect(res.json.firstCall.args[0]).to.deep.equal(Actions.NOT_MIRRORED);
      });
    });
  });
});
