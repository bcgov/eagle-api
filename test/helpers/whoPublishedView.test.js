const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const capturePipeline = require('../support/capturePipeline');
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
    pipeline = await capturePipeline(view);
  });

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
    // $toLower on action is not indexable, so reintroducing it drops the index back to a full scan.
    expect(JSON.stringify(pipeline)).to.not.include('$toLower');
  });

  it('projects action straight from the stored field, since no stage produces a lowercased copy', () => {
    const projected = pipeline.filter(s => s.$project && 'action' in s.$project).map(s => s.$project.action);
    expect(projected).to.deep.equal(['$action', '$action']);
  });
});
