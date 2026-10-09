'use strict';

const { LEGISLATION_KEYS } = require('./constants');

// Every kind eagle-api mirrors to DEMI, parents first: DEMI refuses a child whose parent it lacks.
// sinceFields: Date-typed stamps demi-repush --since may use; the String dateAdded ones compare as text.
const KINDS = {
  project: {
    model: 'Project', schemaName: 'Project', route: 'projects', push: 'project',
    sinceFields: LEGISLATION_KEYS.map(key => key + '.dateUpdated')
  },
  projectNotification: {
    model: 'ProjectNotification', schemaName: 'ProjectNotification', route: 'notifications', push: 'projectNotification',
    sinceFields: []
  },
  organization: {
    model: 'Organization', schemaName: 'Organization', route: 'organizations', push: 'organization',
    sinceFields: ['dateUpdated', 'dateAdded']
  },
  group: { model: 'Group', schemaName: 'Group', route: 'groups', push: 'group', sinceFields: [], optIn: 'groups' },
  document: {
    model: 'Document', schemaName: 'Document', route: 'documents', push: 'document',
    sinceFields: ['_updatedDate', 'dateUploaded']
  },
  commentPeriod: {
    model: 'CommentPeriod', schemaName: 'CommentPeriod', route: 'commentperiods', push: 'commentPeriod',
    sinceFields: ['dateUpdated', 'dateAdded']
  },
  recentActivity: {
    model: 'RecentActivity', schemaName: 'RecentActivity', route: 'updates', push: 'recentActivity',
    sinceFields: ['dateUpdated', 'dateAdded']
  },
  inspection: {
    model: 'Inspection', schemaName: 'Inspection', route: 'inspections', push: 'inspection',
    sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspections'
  },
  inspectionElement: {
    model: 'InspectionElement', schemaName: 'InspectionElement', route: 'inspection-elements', push: 'inspectionElement',
    sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspection-elements'
  },
  inspectionItem: {
    model: 'InspectionItem', schemaName: 'InspectionItem', route: 'inspection-items', push: 'inspectionItem',
    sinceFields: ['_updatedDate', '_createdDate'], optIn: 'inspection-items'
  },
  user: { model: 'User', schemaName: 'User', route: 'users', push: 'user', sinceFields: [], optIn: 'users' },
  comment: {
    model: 'Comment', schemaName: 'Comment', route: 'comments', push: 'comment',
    sinceFields: ['dateUpdated', 'dateAdded']
  }
};

// Row fields that record a push that did not land. They live on the row only and never go to DEMI.
const PENDING_FIELDS = ['demiPushPending', 'demiPushFailedAt', 'demiPushError'];
const PENDING = new Set(PENDING_FIELDS);

/**
 * `value` as JSON.stringify would see it, less the pending fields at any depth: rows nest inside
 * search pages and populated parents. Returns `value` itself when it carries none, so a reply with
 * nothing to drop is neither copied nor changed in type.
 */
function withoutPending(value, ancestors = new Set()) {
  // A cycle goes back as it is, so JSON.stringify reports it rather than this overflowing the stack.
  if (!value || typeof value !== 'object' || ancestors.has(value)) {
    return value;
  }
  if (typeof value.toJSON === 'function') {
    const json = value.toJSON();
    if (json !== value) {
      const out = withoutPending(json, ancestors);
      return out === json ? value : out;
    }
  }
  ancestors.add(value);
  let copy;
  const copyOf = () => copy || (copy = Array.isArray(value) ? value.slice() : Object.assign({}, value));
  for (const key of Object.keys(value)) {
    if (PENDING.has(key)) {
      delete copyOf()[key];
      continue;
    }
    const out = withoutPending(value[key], ancestors);
    if (out !== value[key]) {
      copyOf()[key] = out;
    }
  }
  ancestors.delete(value);
  return copy || value;
}

module.exports = {
  KINDS,
  PENDING_FIELDS,
  withoutPending,
  pushedSchema: name => Object.values(KINDS).some(kind => kind.schemaName === name)
};
