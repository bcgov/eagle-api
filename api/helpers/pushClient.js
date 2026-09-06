'use strict';

const defaultLog = require('winston').loggers.get('default');

const TIMEOUT_MS = 10000;
const ATTEMPTS = 2;

// One outbound JSON push client per downstream service, gated on the env vars it needs: baseEnv
// names the base URL, and keyEnv the API key, which is left out for an endpoint that takes none.
module.exports = function pushClient({ name, baseEnv, keyEnv, keyHeader, method }) {
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

    const url = `${base()}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (keyEnv) {
      headers[keyHeader] = process.env[keyEnv];
    }
    let lastErr = null;
    let lastStatus = null;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
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
        if (res.status < 500) {
          break;
        }
      } catch (err) {
        lastErr = err;
        lastStatus = null;
      }
    }

    if (lastErr) {
      defaultLog.error(`[${name}] ${label} failed`, { error: lastErr.message, stack: lastErr.stack });
    } else {
      defaultLog.error(`[${name}] ${label} rejected ${lastStatus}`);
    }
    return false;
  }

  return { configured, push };
};
