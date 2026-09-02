'use strict';

const client = require('./pushClient')({
  name: 'notifyPush',
  baseEnv: 'NOTIFY_API_BASE',
  keyEnv: 'NOTIFY_API_KEY',
  keyHeader: 'x-functions-key',
  method: 'POST'
});

const EXCERPT_MAX = 500;

// Same public-site base as api/helpers/email.js; no separate public-site env exists
const siteBase = () => process.env.API_HOSTNAME !== undefined ? `https://${process.env.API_HOSTNAME}/` : 'http://localhost:4300/';

function push(body) {
  return client.push('/api/events', body, `event ${body.idempotencyKey}`);
}

function serviceName(recentActivity) {
  return recentActivity.project ? `project:${recentActivity.project}` : 'eao:updates';
}

function excerpt(content) {
  return String(content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_MAX);
}

exports.configured = client.configured;

exports.updatePublished = function (recentActivity, project) {
  if (!recentActivity || !recentActivity._id) {
    return Promise.resolve(true);
  }
  return push({
    kind: 'project-updated',
    serviceName: serviceName(recentActivity),
    title: recentActivity.headline,
    url: recentActivity.project ? `${siteBase()}p/${recentActivity.project}/project-details` : siteBase(),
    projectName: (project && project.name) || null,
    excerpt: excerpt(recentActivity.content),
    idempotencyKey: String(recentActivity._id)
  });
};

exports.updateCancelled = function (recentActivity) {
  if (!recentActivity || !recentActivity._id) {
    return Promise.resolve(true);
  }
  return push({
    kind: 'project-updated',
    serviceName: serviceName(recentActivity),
    title: recentActivity.headline,
    idempotencyKey: String(recentActivity._id),
    cancelled: true
  });
};
