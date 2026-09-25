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

// One outbound JSON push client per downstream service, gated on the env vars it needs: baseEnv
// names the base URL, and keyEnv the API key, which is left out for an endpoint that takes none.
function pushClient({ name, baseEnv, keyEnv, keyHeader, method }) {
  let keyWarned = false;

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
    const entry = { name, label };
    unsent.add(entry);
    try {
      return await send(path, body, label);
    } finally {
      unsent.delete(entry);
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
        // An unread body keeps its connection busy until it is collected.
        if (res.body) {
          await res.body.cancel().catch(() => {});
        }
        lastErr = null;
        lastStatus = res.status;
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

module.exports = pushClient;
