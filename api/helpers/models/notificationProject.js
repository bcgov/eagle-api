var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

module.exports = require('../models')('NotificationProject', {
    name: { type: String, default: null },
    type: { type: String, default: null },
    subType: { type: String, default: null },
    proponentName: { type: String, default: null },
    startDate: { type: Date, default: null },
    decisionDate: { type: Date, default: null },
    region: { type: String, default: null },
    notificationDecision: { type: String, default: null },
    description: { type: String, default: null },
    centroid: [{ type: Mixed, default: 0.00 }],

    // Permissions
    read: [{ type: String, trim: true, default: 'sysadmin' }],
    write: [{ type: String, trim: true, default: 'sysadmin' }],
    delete: [{ type: String, trim: true, default: 'sysadmin' }],
}, 'epic');
