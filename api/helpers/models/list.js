module.exports = require('../models')('List', {
  name         : { type: String, default:null },
  type         : { type: String, default: null, index: true },
  item         : { type: String, default:null },
  guid         : { type: String, default:null, index: true },

  // TODO: Decide who should be able to access.
  read         : [{ type: String, trim: true, default: '["public"]' }],
}, 'epic');