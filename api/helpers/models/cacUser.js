module.exports = require('../models')('CACUser', {
  name    : { type: String, default:'' },
  email   : { type: String, index: true },
  comment : { type: String, default: '' },
  read    : [{ type: String, trim: true, default: 'sysadmin' }],
  write   : [{ type: String, trim: true, default: 'sysadmin' }]
}, 'epic');