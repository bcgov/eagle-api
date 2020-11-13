const mongoose = require('mongoose');
const Mixed = mongoose.Schema.Types.Mixed;

module.exports = require('../models')('Config', {
  configuration        : { type: Mixed, default: {} },
}, 'epic');