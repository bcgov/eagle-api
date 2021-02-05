var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

module.exports = require('../models')('ProjectNotification', {
  name: { type: String, default: null },
  type: { type: String, default: null },
  subType: { type: String, default: null },
  proponent: { type: String, default: null },
  nature: { type: String, default: null },
  region: { type: String, default: null },
  location: { type: String, default: null },
  decision: { type: String, default: null },
  decisionDate: { type: Date, default: null },
  notificationReceivedDate: { type: Date, default: null },
  description: { type: String, default: null },
  notificationThresholdValue: { type: Number, default: null},
  notificationThresholdUnits: { type: String, default: null },
  trigger: { type: String, default: null },
  associatedProjectId: { type: String, default: null },
  associatedProjectName : { type: String, default: null },
  centroid: [{ type: Mixed, default: 0.00 }],

  // Permissions
  read: [{ type: String, trim: true, default: 'sysadmin' }],
  write: [{ type: String, trim: true, default: 'sysadmin' }],
  delete: [{ type: String, trim: true, default: 'sysadmin' }],
}, 'epic');
