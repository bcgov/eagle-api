/**
 * Extension/suspension handlers: DEMI push after a successful write.
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

describe('Project Extension Handlers', () => {
  let res, projectModel, fresh;

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
    fresh = { _id: PROJ_ID, name: 'Test Project' };

    projectModel = {
      updateOne: sinon.stub().resolves({ modifiedCount: 1 }),
      findById: sinon.stub().resolves(fresh)
    };

    sinon.stub(mongoose, 'model').callsFake(name => (name === 'Project' ? projectModel : {}));
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => r.status(code).json(data));
    sinon.stub(demiPush, 'project').resolves();
  });

  afterEach(() => sinon.restore());

  [
    ['protectedExtensionAdd', addArgs],
    ['protectedExtensionDelete', deleteArgs],
    ['protectedExtensionUpdate', updateArgs]
  ].forEach(([handler, args]) => {
    it(`${handler} pushes the re-read project to DEMI and returns 200`, async () => {
      await projectController[handler](args(), res);

      expect(res.status.calledWith(200)).to.be.true;
      expect(projectModel.findById.calledOnceWith(PROJ_ID)).to.be.true;
      expect(demiPush.project.calledOnceWithExactly(fresh)).to.be.true;
    });
  });

  it('still returns 200 and pushes null when the re-read fails', async () => {
    projectModel.findById.rejects(new Error('mongo down'));

    await projectController.protectedExtensionAdd(addArgs(), res);

    expect(res.status.calledWith(200)).to.be.true;
    expect(demiPush.project.calledOnceWithExactly(null)).to.be.true;
  });
});
