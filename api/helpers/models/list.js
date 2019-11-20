module.exports = require('../models')('List', {
  name         : { type: String, default:null },
  type         : { type: String, default: null, index: true },
  item         : { type: String, default:null },
  guid         : { type: String, default:null, index: true },
  legislation  : { type: Number, default: 0 },
  listOrder    : { type: Number },

  // TODO: Decide who should be able to access.
  read         : [{ type: String, trim: true, default: '["public"]' }],
  write        : [{ type: String, trim: true, default: '["staff"]' }]
}, 'epic');