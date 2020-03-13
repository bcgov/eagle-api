module.exports = require('../models')('CACUser', {
  name            : { type: String, default:'' },
  email           : { type: String },
  liveNear        : { type: String, default: '' },
  memberOf        : { type: String, default: '' },
  knowledgeOf     : { type: String, default: '' },
  additionalNotes : { type: String, default: '' },
  project         : { type: 'ObjectId', ref: 'Project', default: null, index: true },
  read            : [{ type: String, trim: true, default: 'sysadmin' }],
  write           : [{ type: String, trim: true, default: 'sysadmin' }]
}, 'epic');