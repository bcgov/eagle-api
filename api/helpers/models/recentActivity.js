const { STATUSES } = require('../updateRules');

module.exports = require ('../models')('RecentActivity', {
  dateUpdated               : { type: Date, default: Date.now() },
  dateAdded                 : { type: Date, default: Date.now() },
  _addedBy                  : { type: String, default: null },
  _updatedBy                : { type: String, default: null },

  pinned                    : { type: Boolean, default: false },
  documentUrl               : { type: String, default: null },
  contentUrl                : { type: String, default: null },
  type                      : { type: String, default: null },
  notificationName          : { type: String, default: null },
  pcp                       : { type: 'ObjectId', ref: 'CommentPeriod', default: null, index: true },
  projectNotification       : { type: 'ObjectId', ref: 'projectNotification', default: null, index: true},
  active                    : { type: Boolean, default: false },
  project                   : { type: 'ObjectId', ref: 'Project', default: null, index: true },
  content                   : { type: String, default: null },
  headline                  : { type: String, default: null },
  complianceAndEnforcement  : { type: Boolean, default: false },

  // Update fields. Optional so rows written before them stay valid; write checks in helpers/updateRules.
  category                  : { type: String, default: null },
  shortHeadline             : { type: String, default: null },
  summary                   : { type: String, default: null },
  featuredImage             : {
    document                : { type: 'ObjectId', ref: 'Document', default: null },
    alt                     : { type: String, default: null }
  },
  attachments               : [{ type: 'ObjectId', ref: 'Document' }],
  regions                   : [{ type: String, trim: true }],
  location                  : { type: String, default: null },
  engagementUrl             : { type: String, default: null },
  subject                   : { type: String, default: null },
  status                    : { type: String, enum: [...STATUSES, null], default: null },
  publishDate               : { type: Date, default: null },
  notifiedAt                : { type: Date, default: null },


  // Permissions
  read             : [{ type: String, trim: true, default: 'sysadmin' }],
  write            : [{ type: String, trim: true, default: 'sysadmin' }],
  delete           : [{ type: String, trim: true, default: 'sysadmin' }],
}, 'epic');
