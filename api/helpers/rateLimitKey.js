'use strict';

const { ipKeyGenerator } = require('express-rate-limit');

// X-Azure-SocketIP is the TCP peer Front Door itself saw at the edge; X-Azure-ClientIP is
// derived from the caller's own X-Forwarded-For and is therefore forgeable.
module.exports = function rateLimitKey(req) {
  // Required lazily so auth.js loads under the test env it expects, not at file-collection time.
  const { safeEqual } = require('./auth');
  const frontDoorId = process.env.FRONT_DOOR_ID;
  const viaFrontDoor = frontDoorId && safeEqual(req.get('X-Azure-FDID'), frontDoorId);
  const ip = (viaFrontDoor && req.get('X-Azure-SocketIP')) || req.ip || '';
  return ipKeyGenerator(ip);
};
