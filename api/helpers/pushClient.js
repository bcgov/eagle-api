'use strict';

const defaultLog = require('winston').loggers.get('default');

const TIMEOUT_MS = 10000;
// Fetch errors and 5xx: tries in total, with a short pause before the retry.
const ATTEMPTS = 2;
const BACKOFF_MS = 1000;
// 429s are retried on their own count, waiting as long as Retry-After asks within these bounds.
const THROTTLE_RETRIES = 3;
const RETRY_AFTER_MIN_MS = 1000;
const RETRY_AFTER_MAX_MS = 60000;
const JITTER_MS = 1000;
// Per client: pushes past the concurrency limit wait in a queue, and past its length are dropped.
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_QUEUE_MAX = 1000;
// The one line a push that never landed logs. The marker is what an --ids-file is grepped from,
// so every drop goes through here.
function logDropped(name, label, reason, meta) {
  const message = `[${name}] push-dropped ${label}: ${reason}`;
  if (meta) {
    defaultLog.error(message, meta);
  } else {
    defaultLog.error(message);
  }
}

// One pacer for the whole process, awaited before every HTTP attempt, retries included. Only a
// backfill sets one; live pods run unpaced.
let pacer = null;

// Pushes started and not yet settled, so shutdown can name the ones the process takes with it.
const unsent = new Set();

// Unref'd so a push waiting to retry never holds a stopping process open.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms).unref());
const jitter = () => Math.floor(Math.random() * JITTER_MS);

// Retry-After is either delay-seconds or an HTTP-date. Anything unreadable, negative or already
// past waits the minimum; a huge value, Infinity included, waits the maximum.
function retryAfterMs(header, now) {
  const text = String(header || '').trim();
  let ms = NaN;
  if (text !== '') {
    const seconds = Number(text);
    ms = Number.isNaN(seconds) ? Date.parse(text) - now : seconds * 1000;
  }
  if (Number.isNaN(ms)) {
    return RETRY_AFTER_MIN_MS;
  }
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

function positiveIntEnv(name, env, fallback) {
  const raw = process.env[env];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  defaultLog.warn(`[${name}] ${env}=${raw} is not a positive whole number — using ${fallback}`);
  return fallback;
}

// The `code` of a refusal's small JSON body, or null when it has none or is not JSON.
async function refusalCode(res) {
  try {
    const body = await res.json();
    return (body && typeof body.code === 'string') ? body.code : null;
  } catch (err) {
    return null;
  }
}

function queueMax(name) {
  return positiveIntEnv(name, 'DEMI_PUSH_QUEUE_MAX', DEFAULT_QUEUE_MAX);
}

// One outbound JSON push client per downstream service, gated on the env vars it needs: baseEnv
// names the base URL, and keyEnv the API key, which is left out for an endpoint that takes none.
// onRefused({ label, status, code }) is offered every 404; returning true means the caller took the
// record and logs it itself, so no push-dropped line is written here.
function pushClient({ name, baseEnv, keyEnv, keyHeader, method, onRefused }) {
  let keyWarned = false;
  // Read on first push, not at require time, so a .env loaded after the require still counts.
  let limits = null;
  let active = 0;
  const waiting = [];

  const base = () => process.env[baseEnv];

  function configured() {
    if (!base()) {
      return false;
    }
    if (keyEnv && !process.env[keyEnv]) {
      if (!keyWarned) {
        keyWarned = true;
        defaultLog.warn(`[${name}] ${keyEnv} unset — pushes disabled`);
      }
      return false;
    }
    return true;
  }

  // Resolves true when the body landed (or pushes are off), false when it did not.
  async function push(path, body, label) {
    if (!configured()) {
      return true;
    }
    if (!limits) {
      limits = {
        concurrency: positiveIntEnv(name, 'DEMI_PUSH_CONCURRENCY', DEFAULT_CONCURRENCY),
        queueMax: queueMax(name)
      };
    }
    if (active >= limits.concurrency && waiting.length >= limits.queueMax) {
      logDropped(name, label, 'queue full');
      return false;
    }
    const entry = { name, label };
    unsent.add(entry);
    try {
      if (active < limits.concurrency) {
        active++;
      } else {
        // release() hands its slot straight to the waiter, so active stays as it was.
        await new Promise(resolve => waiting.push(resolve));
      }
      try {
        return await send(path, body, label);
      } finally {
        release();
      }
    } finally {
      unsent.delete(entry);
    }
  }

  function release() {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      active--;
    }
  }

  async function send(path, body, label) {
    const url = `${base()}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (keyEnv) {
      headers[keyHeader] = process.env[keyEnv];
    }
    let lastErr = null;
    let lastStatus = null;
    let failures = 0;
    let throttles = 0;

    for (;;) {
      try {
        if (pacer) {
          await pacer.acquire();
        }
        const res = await fetch(url, {
          method: method,
          body: JSON.stringify(body),
          headers: headers,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        if (res.ok) {
          return true;
        }
        lastErr = null;
        lastStatus = res.status;
        if (res.status === 404 && onRefused) {
          // Reading the body frees its connection as cancelling it would.
          const code = await refusalCode(res);
          if (onRefused({ label, status: res.status, code })) {
            return false;
          }
          break;
        }
        // An unread body keeps its connection busy until it is collected.
        if (res.body) {
          await res.body.cancel().catch(() => {});
        }
        if (res.status === 429 && throttles < THROTTLE_RETRIES) {
          throttles++;
          const wait = retryAfterMs(res.headers && res.headers.get('retry-after'), Date.now());
          if (pacer && pacer.pause) {
            pacer.pause(wait);
          }
          await sleep(wait + jitter());
          continue;
        }
        if (res.status < 500) {
          break;
        }
      } catch (err) {
        lastErr = err;
        lastStatus = null;
      }
      if (++failures >= ATTEMPTS) {
        break;
      }
      await sleep(BACKOFF_MS + jitter());
    }

    if (lastErr) {
      logDropped(name, label, 'failed', { error: lastErr.message, stack: lastErr.stack });
    } else {
      logDropped(name, label, `rejected ${lastStatus}`);
    }
    return false;
  }

  return { configured, push };
}

// null goes back to unpaced. pause(ms) is optional: a 429 calls it so every other push holds off
// too, not only the one that was throttled.
pushClient.setPacer = function (next) {
  pacer = next || null;
};

// For the shutdown path: a push still in flight or waiting to retry is lost with the process.
pushClient.logUnsent = function () {
  for (const { name, label } of unsent) {
    logDropped(name, label, 'failed (process stopping)');
  }
};

pushClient.logDropped = logDropped;
pushClient.queueMax = queueMax;

module.exports = pushClient;
