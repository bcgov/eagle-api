'use strict';

const mongoose = require('mongoose');
const defaultLog = require('winston').loggers.get('default');
const { legislationSwitch } = require('../helpers/constants');

// Public site host the project pages live on. Not API_HOSTNAME: on dev and test that names the
// OpenShift API host, not the public site.
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://projects.eao.gov.bc.ca').replace(/\/+$/, '');
const CACHE_TTL_MS = 60 * 60 * 1000;
// Sitemap protocol limit per file; past it the fix is a sitemap index, not a bigger file.
const MAX_ENTRIES = 50000;

let cache = null; // { promise, expiresAt }

/**
 * Projects anonymous visitors can read, with the dateUpdated of each project's current legislation
 * block. `read: 'public'` is the same tag the public project list's $redact admits for role 'public'.
 */
function findPublicProjects() {
  return mongoose.model('Project').aggregate([
    { $match: { _schemaName: 'Project', read: 'public' } },
    { $project: { current: legislationSwitch() } },
    { $project: { _id: 1, dateUpdated: '$current.dateUpdated' } },
    { $sort: { _id: 1 } }
  ])
    .collation({ locale: 'en', strength: 2 })
    .exec();
}

function lastmodOf(value) {
  const date = value ? new Date(value) : null;
  return date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

async function buildSitemap() {
  let projects = await findPublicProjects();
  if (projects.length > MAX_ENTRIES) {
    defaultLog.warn('sitemap: %d public projects exceeds the %d entry limit, truncating', projects.length, MAX_ENTRIES);
    projects = projects.slice(0, MAX_ENTRIES);
  }

  const urls = projects.map(project => {
    const lastmod = lastmodOf(project.dateUpdated);
    return '  <url>\n'
      + `    <loc>${PUBLIC_SITE_URL}/p/${String(project._id)}</loc>\n`
      + (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '')
      + '  </url>\n';
  });

  defaultLog.info('sitemap: rebuilt with %d entries', urls.length);
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.join('')
    + '</urlset>\n';
}

/**
 * GET /api/public/sitemap.xml: sitemap of every public project page, for search engines.
 * Unauthenticated. Built at most once an hour per pod; concurrent misses share one build.
 */
exports.publicGet = async function (req, res) {
  const now = Date.now();
  if (!cache || cache.expiresAt <= now) {
    const entry = { promise: buildSitemap(), expiresAt: now + CACHE_TTL_MS };
    cache = entry;
    // A failed build must not be served for the rest of the hour.
    entry.promise.catch(() => {
      if (cache === entry) cache = null;
    });
  }

  const xml = await cache.promise;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(xml);
};

// Test hook: forget the cached sitemap.
exports._resetCache = function () {
  cache = null;
};
