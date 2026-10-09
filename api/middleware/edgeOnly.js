'use strict';

const { infoConsoleLogger } = require('../helpers/logFormat');

const edgeLog = infoConsoleLogger('edge-gate');

// Raw Host header, not req.hostname: with `trust proxy` set, req.hostname reads X-Forwarded-Host,
// which the caller controls.
function requestHost(req) {
  return (req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
}

/**
 * Guards the direct Route host so only requests that came through Azure Front Door get in.
 * Off unless both EDGE_ONLY_HOST and FRONT_DOOR_ID are set. EDGE_ONLY_MODE=log serves and records
 * would-be refusals; any other value refuses them with 403. Other hosts (in-cluster callers,
 * the console Route) and /api/health pass untouched.
 */
module.exports = function edgeOnly(req, res, next) {
  const edgeHost = process.env.EDGE_ONLY_HOST;
  const frontDoorId = process.env.FRONT_DOOR_ID;
  if (!edgeHost || !frontDoorId || req.path === '/api/health') {
    return next();
  }

  const host = requestHost(req);
  if (host !== edgeHost.toLowerCase()) {
    return next();
  }

  // Required lazily so auth.js loads under the test env it expects, as in rateLimitKey.js.
  const { safeEqual } = require('../helpers/auth');
  if (safeEqual(req.get('X-Azure-FDID'), frontDoorId)) {
    return next();
  }

  const mode = process.env.EDGE_ONLY_MODE === 'log' ? 'log' : 'enforce';
  // Object form keeps the path out of format.splat; the custom_event attribute makes the
  // Azure Monitor exporter file this as an App Insights custom event, not a trace.
  edgeLog.log({
    level: 'warn',
    message: `edge-gate: request skipped Front Door path=${req.path} host=${host} mode=${mode}`,
    'microsoft.custom_event.name': 'edge-gate-refusal',
    path: req.path,
    host,
    mode
  });
  if (mode === 'log') {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden' });
};
