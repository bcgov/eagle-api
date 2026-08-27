'use strict';

const { ipKeyGenerator } = require('express-rate-limit');

// Behind Front Door req.ip is the POP address; X-Azure-ClientIP is the client, honoured only when
// X-Azure-FDID matches our profile so a direct caller cannot forge it. Unset id = key on req.ip.
module.exports = function rateLimitKey(req) {
  const frontDoorId = process.env.FRONT_DOOR_ID;
  const viaFrontDoor = frontDoorId && req.get('X-Azure-FDID') === frontDoorId;
  const ip = (viaFrontDoor && req.get('X-Azure-ClientIP')) || req.ip || '';
  const parts = ip.split(':');
  return ipKeyGenerator(parts.length === 2 ? parts[0] : ip); // one colon means IPv4:port
};
