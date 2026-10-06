/**
 * GET /public/sitemap.xml against a real MongoDB: the project list it renders must be exactly the
 * projects GET /public/project shows an anonymous visitor, with lastmod from the current
 * legislation block.
 *
 *   npm run db:up
 *   npm run test:db
 */

'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');
const { XMLParser } = require('fast-xml-parser');

require('../../app_helper');

const projectController = require('../../api/controllers/project');
const sitemapController = require('../../api/controllers/sitemap');

const {
  TEST_URI,
  id,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
} = require('./parentReadFixtures');

const DATED_PROJECT = id('58990017d334ee001d608b0d');

const FIXTURES = [
  ...PARENT_FIXTURES,
  {
    _id: DATED_PROJECT,
    _schemaName: 'Project',
    read: ['public'],
    currentLegislationYear: 'legislation_2018',
    legislation_2018: { name: 'Dated Project', dateUpdated: new Date('2026-05-06T10:00:00Z') },
    legislation_2002: { name: 'Dated Project', dateUpdated: new Date('2019-01-01T10:00:00Z') }
  }
];

const publicListArgs = {
  swagger: {
    params: {
      fields: { value: ['name'] },
      pageSize: { value: 1000 },
      pageNum: { value: 0 }
    }
  }
};

async function sitemapUrls() {
  const { res, body } = capture();
  await sitemapController.publicGet({}, res);
  return [].concat(new XMLParser().parse(body.data).urlset.url || []);
}

const idOf = url => url.loc.split('/p/')[1];

describe('Public sitemap (requires MongoDB)', function () {
  this.timeout(20000);

  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  beforeEach(async () => {
    sitemapController._resetCache();
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.connection.collection('epic').insertMany(FIXTURES);
  });

  after(async () => {
    await mongoose.connection.collection('epic').deleteMany({});
    await mongoose.disconnect();
  });

  it('lists a public project and leaves out an unpublished one', async () => {
    const ids = (await sitemapUrls()).map(idOf);

    expect(ids).to.include(String(PUBLIC_PROJECT));
    expect(ids).to.not.include(String(PRIVATE_PROJECT));
  });

  it('lists the same projects the anonymous project list shows', async () => {
    const { res, body } = capture();
    await projectController.publicGet(publicListArgs, res);

    const ids = (await sitemapUrls()).map(idOf);

    expect(ids).to.have.members(idsIn(body.data));
  });

  it('takes lastmod from the current legislation block', async () => {
    const url = (await sitemapUrls()).find(entry => idOf(entry) === String(DATED_PROJECT));

    expect(url.lastmod).to.equal('2026-05-06');
  });
});
