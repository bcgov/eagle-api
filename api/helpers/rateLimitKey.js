'use strict';

const crypto = require('crypto');
const { ipKeyGenerator } = require('express-rate-limit');

// Same shape as api/helpers/auth.js's INTERNAL_API_KEY check: length guard then timingSafeEqual.
function safeEqual(a, b) {
  const aBuf = Buffer.from(a || '');
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

// Behind Front Door req.ip is the POP address; X-Azure-ClientIP is the client, honoured only when
// X-Azure-FDID matches our profile so a direct caller cannot forge it. Unset id = key on req.ip.
module.exports = function rateLimitKey(req) {
  const frontDoorId = process.env.FRONT_DOOR_ID;
  const viaFrontDoor = frontDoorId && safeEqual(req.get('X-Azure-FDID'), frontDoorId);
  const ip = (viaFrontDoor && req.get('X-Azure-ClientIP')) || req.ip || '';
  return ipKeyGenerator(ip);
};
