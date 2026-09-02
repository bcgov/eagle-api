'use strict';

const defaultLog = require('winston').loggers.get('default');

const TIMEOUT_MS = 10000;
const ATTEMPTS = 2;
const EXCERPT_MAX = 500;

// Same public-site base as api/helpers/email.js; no separate public-site env exists
const siteBase = () => process.env.API_HOSTNAME !== undefined ? `https://${process.env.API_HOSTNAME}/` : 'http://localhost:4300/';

let keyWarned = false;

function configured() {
  if (!process.env.NOTIFY_API_BASE) {
    return false;
  }
  if (!process.env.NOTIFY_API_KEY) {
    if (!keyWarned) {
      keyWarned = true;
      defaultLog.warn('[notifyPush] NOTIFY_API_KEY unset — pushes disabled');
    }
    return false;
  }
  return true;
}

// Resolves true when the event landed (or pushes are off), false when it did not.
async function push(body) {
  if (!configured()) {
    return true;
  }

  const url = `${process.env.NOTIFY_API_BASE}/api/events`;
  let lastErr = null;
  let lastStatus = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'x-functions-key': process.env.NOTIFY_API_KEY
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.ok) {
        return true;
      }
      lastErr = null;
      lastStatus = res.status;
      if (res.status < 500) {
        break;
      }
    } catch (err) {
      lastErr = err;
      lastStatus = null;
    }
  }

  if (lastErr) {
    defaultLog.error(`[notifyPush] event ${body.idempotencyKey} failed`, { error: lastErr.message, stack: lastErr.stack });
  } else {
    defaultLog.error(`[notifyPush] event ${body.idempotencyKey} rejected ${lastStatus}`);
  }
  return false;
}

function serviceName(recentActivity) {
  return recentActivity.project ? `project:${recentActivity.project}` : 'eao:updates';
}

function excerpt(content) {
  return String(content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_MAX);
}

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
