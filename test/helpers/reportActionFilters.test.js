const { expect } = require('chai');
const capturePipeline = require('../support/capturePipeline');

const changesNonPublic = require('../../api/materialized_views/reports/changesPerformedByNonPublicUsers');
const changesLast14 = require('../../api/materialized_views/reports/changesPerformedOverLast14Days');
const topSearchTerms = require('../../api/materialized_views/reports/topSearchTerms');
const usersAllTime = require('../../api/materialized_views/reports/topUserVisitsAllTime');
const usersLast14 = require('../../api/materialized_views/reports/topUserVisitsLast14');

// Any timestamp other than constants.minDate takes the incremental branch of the watermarked views.
const AFTER = new Date('2026-01-01');

const READS = ['get', 'search', 'summary'];

// Most reports nest the action filter in $and; topSearchTerms puts it straight on $match.
function actionFilters(pipeline) {
  return pipeline
    .filter(stage => stage.$match)
    .flatMap(stage => stage.$match.$and || [stage.$match])
    .map(clause => clause.action)
    .filter(clause => clause !== undefined);
}

// recordAction lowercases action on write, so every report must match the lowercase spelling only —
// and on the right side of the read/change split.
describe('report pipelines filter action on lowercase spellings', () => {
  it('changesPerformedByNonPublicUsers counts everything except reads', async () => {
    const pipeline = await capturePipeline(changesNonPublic, AFTER);
    expect(actionFilters(pipeline)).to.deep.equal([{ $nin: READS }]);
  });

  it('changesPerformedOverLast14Days counts everything except reads', async () => {
    const pipeline = await capturePipeline(changesLast14);
    expect(actionFilters(pipeline)).to.deep.equal([{ $nin: READS }]);
  });

  it('topSearchTerms counts search rows only', async () => {
    const pipeline = await capturePipeline(topSearchTerms, AFTER);
    expect(actionFilters(pipeline)).to.deep.equal([{ $eq: 'search' }]);
  });

  it('topUserVisitsAllTime counts reads only', async () => {
    const pipeline = await capturePipeline(usersAllTime, AFTER);
    expect(actionFilters(pipeline)).to.deep.equal([{ $in: READS }]);
  });

  it('topUserVisitsLast14 counts reads only', async () => {
    const pipeline = await capturePipeline(usersLast14);
    expect(actionFilters(pipeline)).to.deep.equal([{ $in: READS }]);
  });
});
