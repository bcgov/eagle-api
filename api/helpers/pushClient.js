'use strict';

const defaultLog = require('winston').loggers.get('default');

const TIMEOUT_MS = 10000;
const ATTEMPTS = 2;

// One outbound JSON push client per downstream service, gated on its own env pair.
module.exports = function pushClient({ name, baseEnv, keyEnv, keyHeader, method }) {
  let keyWarned = false;

  function configured() {
    if (!process.env[baseEnv]) {
      return false;
    }
    if (!process.env[keyEnv]) {
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

    const url = `${process.env[baseEnv]}${path}`;
    let lastErr = null;
    let lastStatus = null;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: method,
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            [keyHeader]: process.env[keyEnv]
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
      defaultLog.error(`[${name}] ${label} failed`, { error: lastErr.message, stack: lastErr.stack });
    } else {
      defaultLog.error(`[${name}] ${label} rejected ${lastStatus}`);
    }
    return false;
  }

  return { configured, push };
};
