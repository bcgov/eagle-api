'use strict';

const defaultLog = require('winston').loggers.get('default');

const pushClient = require('./pushClient');

// Two APIM APIs, two clients: events ride the anonymous one, audit rows the keyed one. Each is gated
// on what it actually needs, so a missing subscription key silences audit without silencing events.
const eventsClient = pushClient({ name: 'analytics', baseEnv: 'ANALYTICS_API_URL', method: 'POST' });
const auditClient = pushClient({
  name: 'analytics audit',
  baseEnv: 'ANALYTICS_AUDIT_URL',
  keyEnv: 'ANALYTICS_API_KEY',
  keyHeader: 'Ocp-Apim-Subscription-Key',
  method: 'POST'
});

const SOURCE_APP = 'eagle-api';
const FLUSH_MS = 5000;
// Limits the ingest API enforces (eagle-analytics src/ingest/validate.js): at most 50 entries a
// batch, and a batch is refused whole when one row's properties or detail serialize past 8000 bytes.
const MAX_ROWS = 20;
const MAX_DETAIL_BYTES = 8000;
const MAX_TEXT_CHARS = 500;

const EVENTS = { client: eventsClient, path: '/events', field: 'events', rows: [] };
const AUDIT = { client: auditClient, path: '/audit', field: 'rows', rows: [] };

let timer = null;

/**
 * Free text trimmed, then the whole object dropped if it still will not fit: one oversized row would
 * take every other row in its batch down with it.
 */
function capped(value, label) {
  const trimmed = {};
  for (const [key, entry] of Object.entries(value)) {
    trimmed[key] = typeof entry === 'string' && entry.length > MAX_TEXT_CHARS ? entry.slice(0, MAX_TEXT_CHARS) : entry;
  }

  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(trimmed));
  } catch (err) {
    // Circular reference or BigInt. The ingest validator refuses these too.
    defaultLog.warn(`[analytics] ${label} is not serializable: ${err.message}`);
    return { truncated: true };
  }

  if (bytes > MAX_DETAIL_BYTES) {
    defaultLog.warn(`[analytics] ${label} is ${bytes} bytes, over the ${MAX_DETAIL_BYTES} byte ingest limit`);
    return { truncated: true };
  }

  return trimmed;
}

async function flush(buffer) {
  // Emptied before the await so rows arriving mid-flight land in the next batch and the batch
  // never grows past MAX_ROWS.
  const rows = buffer.rows.splice(0, buffer.rows.length);
  if (rows.length === 0) {
    return;
  }

  const landed = await buffer.client.push(buffer.path, { [buffer.field]: rows }, `${rows.length} ${buffer.field}`);
  // pushClient already logged why it failed. Events are shrugged off; a lost audit row is not, so
  // name what went missing.
  if (!landed && buffer === AUDIT) {
    defaultLog.error(`[analytics] lost ${rows.length} audit rows`, { actions: rows.map(row => row.action) });
  }
}

/** A flush nobody awaits: a failed push is logged here rather than surfacing as an unhandled rejection. */
function flushSoon(buffer) {
  flush(buffer).catch(err => defaultLog.error('[analytics] flush failed', { error: err.message, stack: err.stack }));
}

function scheduleFlush() {
  if (timer) {
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    flushSoon(EVENTS);
    flushSoon(AUDIT);
  }, FLUSH_MS);
  // A buffer of analytics rows must not be what keeps the process alive.
  timer.unref();
}

function enqueue(buffer, row) {
  if (!buffer.client.configured()) {
    return;
  }
  buffer.rows.push(row);
  if (buffer.rows.length >= MAX_ROWS) {
    flushSoon(buffer);
  } else {
    scheduleFlush();
  }
}

/**
 * Product event. Fire-and-forget: nothing here is allowed to fail a request.
 *
 * No sessionId: these rows come from a pod handling a request, not from a browser session.
 */
exports.trackEvent = function (eventType, properties, { userId } = {}) {
  enqueue(EVENTS, {
    timestamp: new Date().toISOString(),
    eventType: eventType,
    sourceApp: SOURCE_APP,
    userId: userId,
    properties: capped(properties || {}, `${eventType} properties`)
  });
};

/** Staff action for the audit trail. Same fire-and-forget contract as trackEvent. */
exports.auditEvent = function (row) {
  const audit = Object.assign({}, row, { sourceApp: SOURCE_APP });
  if (audit.detail && typeof audit.detail === 'object') {
    audit.detail = capped(audit.detail, `${audit.action} detail`);
  }
  enqueue(AUDIT, audit);
};

/**
 * The one line a write handler adds. Actor comes from the Keycloak payload the security middleware
 * already put on the request; `target` carries `type`, `id` and optionally `projectId` and `detail`.
 */
exports.auditFromRequest = function (args, action, target = {}) {
  // Guarded here, not in auditEvent: recordAction reaches this from the project, document and
  // comment period write handlers, and a bad row must not become a failed request.
  try {
    const payload = (args && args.swagger && args.swagger.params && args.swagger.params.auth_payload) || {};
    const roles = (payload.realm_access && payload.realm_access.roles) || [];
    // swagger-security.js hands unauthenticated routes a synthetic payload whose only role is
    // 'public'. Neither a subject nor a role means no token reached us at all, which is not
    // something to present as staff.
    const isPublic = roles.length === 1 && roles[0] === 'public';

    exports.auditEvent({
      action: action,
      actorId: payload.sub,
      actorName: payload.preferred_username,
      actorType: isPublic ? 'public' : (payload.sub || roles.length > 0 ? 'staff' : 'unknown'),
      actorRoles: roles,
      targetType: target.type,
      targetId: target.id ? String(target.id) : undefined,
      projectId: target.projectId ? String(target.projectId) : undefined,
      detail: target.detail
    });
  } catch (err) {
    defaultLog.warn('[analytics] auditFromRequest failed', { error: err.message });
  }
};

/** Drains both buffers. Awaited on shutdown, where the alternative is losing what they hold. */
exports.flush = () => Promise.all([flush(EVENTS), flush(AUDIT)]);

// Test seams: the buffers and the pending flush are process-wide, so a spec that asserts on a flush
// needs to read the buffers and to cancel a timer the spec before it left scheduled.
exports._buffers = { events: EVENTS, audit: AUDIT };
exports._clearTimer = () => { clearTimeout(timer); timer = null; };
