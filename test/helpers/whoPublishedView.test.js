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
    const first = pipeline[0].$match;
    expect(first.objId).to.deep.equal({ $ne: null });
    // Call sites may spell it Publish, publish or UnPublish; recordAction lowercases before the row
    // is written, so what the prefilter must cover is the lowercased form of each.
    expect(first.action.$in).to.include.members(spellings.map(s => s.toLowerCase()));
  });

  it('matches lowercase only, because recordAction lowercases action on write', () => {
    expect(pipeline[0].$match.action.$in).to.deep.equal(['publish', 'unpublish']);
  });

  it('never lowercases at query time, so the {action, objId} index can seek', () => {
    // A $toLower on action is not indexable and scanned 22M audit rows in prod. The invariant lives
    // at the write point now; reintroducing it here would silently drop the index back to a scan.
    expect(JSON.stringify(pipeline)).to.not.include('$toLower');
  });
});
