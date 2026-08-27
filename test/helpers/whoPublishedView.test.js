const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const view = require('../../api/materialized_views/reports/whoPublishedUnpublishedAllUsers');

// Every publish/unpublish spelling recordAction writes anywhere under api/.
function spellingsInSource() {
  const out = new Set();
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (!p.endsWith('.js')) return;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/recordAction\(\s*'([A-Za-z]*[Pp]ublish)'/g)) out.add(m[1]);
  });
  walk(path.join(__dirname, '../../api'));
  return [...out];
}

describe('whoPublishedUnpublishedAllUsers pipeline', () => {
  let pipeline;

  beforeEach(async () => {
    const aggregate = sinon.stub().callsFake((p) => { pipeline = p; return Promise.resolve([]); });
    sinon.stub(mongoose, 'model').returns({ aggregate });
    sinon.stub(mongoose, 'connection').value({
      db: { collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [{ _id: 1 }] }) }) }) }
    });
    await view.update({ debug() {} });
  });

  afterEach(() => sinon.restore());

  it('prefilters on every publish/unpublish spelling the code writes, so the index seeks', () => {
    const spellings = spellingsInSource();
    expect(spellings.length).to.be.greaterThan(1);
    expect(spellings, 'DAOs must write Unpublish, not UnPublish').to.not.include('UnPublish');
    const first = pipeline[0].$match;
    expect(first.objId).to.deep.equal({ $ne: null });
    expect(first.action.$in).to.include.members(spellings);
  });

  it('keeps every spelling ever written, so old audit rows stay in the report', () => {
    // documentDAO/pinDAO wrote UnPublish until this fix; prod data holds unPublish.
    expect(pipeline[0].$match.action.$in).to.include.members(
      ['Publish', 'publish', 'Unpublish', 'unpublish', 'unPublish', 'UnPublish']);
  });
});
