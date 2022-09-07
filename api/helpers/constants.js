exports.schemaTypes = Object.freeze({
  ITEM: 'Item',
  DOCUMENT: 'Document',
  CAC: 'CACUser',
  PROJECT: 'Project',
  GROUP: 'Group',
  USER: 'User',
  RECENT_ACTIVITY: 'RecentActivity',
  INSPECTION: 'Inspection',
  INSPECTION_ELEMENT: 'InspectionElement',
  PROJECT_NOTIFICATION: 'ProjectNotification',
  LIST: 'List',
  COMMENT: 'Comment',
  COMMENT_PERIOD: 'CommentPeriod',
  ORGANIZATION: 'Organization',
});

exports.MAX_FEATURE_DOCS = 5;

exports.PUBLIC_ROLES = ['public'];
exports.SECURE_ROLES = ['sysadmin', 'staff'];

exports.cacheKeys = Object.freeze({
  LIST: 'List',
  LIST_TIMEOUT: 900
})