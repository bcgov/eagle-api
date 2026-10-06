/**
 * Unit Tests for Sitemap Controller
 *
 * Which projects count as public is decided by the Mongo $match, so that half is covered against a
 * real database in test/db/sitemap.test.js. Here the model is stubbed and the tests cover the XML,
 * the headers, and the hourly cache.
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const { XMLParser, XMLValidator } = require('fast-xml-parser');

const sitemapController = require('../../api/controllers/sitemap');

const PUBLIC_ID = '58990017d334ee001d608b01';
const OTHER_ID = '58990017d334ee001d608b02';
const HOUR_MS = 60 * 60 * 1000;

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

// mongoose.model('Project').aggregate(...).collation(...).exec() -> rows, one stub call per build.
function stubProjects(rows) {
  const exec = sinon.stub().resolves(rows);
  const aggregate = sinon.stub().returns({ collation: () => ({ exec }) });
  sinon.stub(mongoose, 'model').withArgs('Project').returns({ aggregate });
  return exec;
}

async function getSitemap() {
  const res = fakeRes();
  await sitemapController.publicGet({}, res);
  return res;
}

const urlsIn = xml => [].concat(new XMLParser().parse(xml).urlset.url || []);

describe('Sitemap Controller', () => {
  beforeEach(() => sitemapController._resetCache());

  afterEach(() => sinon.restore());

  it('serves well-formed sitemap XML listing each public project page', async () => {
    stubProjects([
      { _id: new mongoose.Types.ObjectId(PUBLIC_ID), dateUpdated: new Date('2026-03-04T19:30:00Z') }
    ]);

    const res = await getSitemap();

    expect(res.statusCode).to.equal(200);
    expect(XMLValidator.validate(res.body)).to.equal(true);
    expect(res.body).to.include('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(urlsIn(res.body)).to.deep.equal([
      { loc: `https://projects.eao.gov.bc.ca/p/${PUBLIC_ID}`, lastmod: '2026-03-04' }
    ]);
  });

  it('sends XML content type and a one hour public cache header', async () => {
    stubProjects([]);

    const res = await getSitemap();

    expect(res.headers['Content-Type']).to.equal('application/xml; charset=utf-8');
    expect(res.headers['Cache-Control']).to.equal('public, max-age=3600');
  });

  it('puts only the site host, /p/ and a 24-hex project id in every loc', async () => {
    stubProjects([
      { _id: new mongoose.Types.ObjectId(PUBLIC_ID), dateUpdated: null },
      { _id: new mongoose.Types.ObjectId(OTHER_ID), dateUpdated: null }
    ]);

    const locs = urlsIn((await getSitemap()).body).map(url => url.loc);

    expect(locs).to.have.lengthOf(2);
    expect(locs.every(loc => /^https:\/\/projects\.eao\.gov\.bc\.ca\/p\/[0-9a-f]{24}$/.test(loc))).to.equal(true);
  });

  it('leaves out lastmod when the project has no usable dateUpdated', async () => {
    stubProjects([{ _id: new mongoose.Types.ObjectId(PUBLIC_ID), dateUpdated: '' }]);

    const [url] = urlsIn((await getSitemap()).body);

    expect(url).to.not.have.property('lastmod');
  });

  it('serves a second call within the hour from cache', async () => {
    const exec = stubProjects([{ _id: new mongoose.Types.ObjectId(PUBLIC_ID) }]);

    const first = await getSitemap();
    const second = await getSitemap();

    expect(exec.callCount).to.equal(1);
    expect(second.body).to.equal(first.body);
  });

  it('rebuilds once the hour has passed', async () => {
    const clock = sinon.useFakeTimers({ now: Date.parse('2026-10-06T12:00:00Z'), toFake: ['Date'] });
    const exec = stubProjects([]);

    await getSitemap();
    clock.tick(HOUR_MS);
    await getSitemap();

    expect(exec.callCount).to.equal(2);
  });

  it('does not cache a failed build', async () => {
    const exec = stubProjects([]);
    exec.onFirstCall().rejects(new Error('mongo down'));

    let failure = null;
    await getSitemap().catch(err => { failure = err; });
    const res = await getSitemap();

    expect(failure).to.be.an('error');
    expect(res.statusCode).to.equal(200);
    expect(exec.callCount).to.equal(2);
  });

  it('caps the sitemap at 50,000 entries', async () => {
    const rows = Array.from({ length: 50001 }, () => ({ _id: new mongoose.Types.ObjectId() }));
    stubProjects(rows);

    const body = (await getSitemap()).body;

    expect(body.split('<loc>').length - 1).to.equal(50000);
  });
});
