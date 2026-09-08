/**
 * Parents and plumbing shared by the parent-visibility specs in this directory.
 *
 * Projects and ProjectNotifications both live in the `epic` collection and both act as a parent
 * for comment periods and documents, so the same set of parents drives every spec here.
 */

'use strict';

const mongoose = require('mongoose');

const TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/epic-parent-read-test?directConnection=true';

const id = (hex) => new mongoose.Types.ObjectId(hex);

const STAFF_ONLY = ['sysadmin', 'staff'];
const PUBLIC_READ = ['public', 'staff', 'sysadmin'];
const PUBLIC_ONLY = ['public'];

// Two parents the public may read, two it may not.
const PUBLIC_PROJECT = id('58990017d334ee001d608b01');
const PRIVATE_PROJECT = id('58990017d334ee001d608bbd');
const PUBLIC_NOTIFICATION = id('6a288dc06452d0c8edd7c32b');
const PRIVATE_NOTIFICATION = id('6a288dc06452d0c8edd7c99b');
// Real Keycloak tokens never carry 'public', so a project readable only by the public is the one
// shape that tells the role-augmentation apart from the caller's raw roles.
const PUBLIC_ONLY_PROJECT = id('58990017d334ee001d608b02');
// A project whose read[] was set to nothing, and one that never had the field. Both mean public.
const EMPTY_READ_PROJECT = id('58990017d334ee001d608b03');
const MISSING_READ_PROJECT = id('58990017d334ee001d608b04');

const project = (_id, read, name) => {
  const doc = {
    _id,
    _schemaName: 'Project',
    currentLegislationYear: 'legislation_2018',
    legislation_2018: { name, type: 'Mine' },
    legislation_2002: { name, type: 'Mine' }
  };
  // undefined means the record never carried a read[] at all, which is not the same as [].
  if (read !== undefined) {
    doc.read = read;
  }
  return doc;
};

const notification = (_id, read, name) => ({
  _id,
  _schemaName: 'ProjectNotification',
  read,
  name,
  type: 'Notification'
});

const PARENT_FIXTURES = [
  project(PUBLIC_PROJECT, PUBLIC_READ, 'Public Project'),
  project(PRIVATE_PROJECT, STAFF_ONLY, 'Unpublished Project'),
  notification(PUBLIC_NOTIFICATION, PUBLIC_READ, 'Public Notification'),
  notification(PRIVATE_NOTIFICATION, STAFF_ONLY, 'Unpublished Notification'),
  project(PUBLIC_ONLY_PROJECT, PUBLIC_ONLY, 'Public Only Project'),
  project(EMPTY_READ_PROJECT, [], 'Unset Read Project'),
  project(MISSING_READ_PROJECT, undefined, 'No Read Field Project')
];

// Controllers answer through Actions.sendResponse, which writes to the express response.
function capture() {
  const body = {};
  const res = {
    status(code) { body.code = code; return this; },
    json(data) { body.data = data; return this; },
    send(data) { body.data = data; return this; },
    setHeader() { }
  };
  return { res, body };
}

const idsIn = (payload) => {
  const rows = Array.isArray(payload) ? payload : [];
  const results = rows.length && rows[0].searchResults ? rows[0].searchResults : rows;
  return results.map(r => String(r._id));
};

module.exports = {
  TEST_URI,
  id,
  STAFF_ONLY,
  PUBLIC_READ,
  PUBLIC_PROJECT,
  PRIVATE_PROJECT,
  PUBLIC_NOTIFICATION,
  PRIVATE_NOTIFICATION,
  PUBLIC_ONLY_PROJECT,
  EMPTY_READ_PROJECT,
  MISSING_READ_PROJECT,
  PARENT_FIXTURES,
  capture,
  idsIn
};
