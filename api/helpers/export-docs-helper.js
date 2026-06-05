'use strict';

/**
 * export-docs-helper.js
 *
 * Shared logic for exporting EPIC project documents to CSV.
 * Used by:
 *   - tools/export-project-docs.js  (CLI / oc exec)
 *   - api/helpers/jobQueue.js        (async Agenda job handler)
 */

const { ObjectId } = require('mongodb');

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/\r?\n/g, ' ');
  return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
}

/**
 * Export project documents to a CSV string.
 *
 * @param {import('mongodb').Db} db   - MongoDB Db instance (e.g. mongoose.connection.db)
 * @param {string}               projectId  - MongoDB ObjectId string
 * @param {boolean}              [includeAll=false] - Include non-Published docs
 * @returns {Promise<string>}    CSV string (header row + data rows)
 */
async function exportProjectDocs(db, projectId, includeAll = false) {
  const col = db.collection('epic');

  // Load all List items for ID → display-name resolution
  const lists = await col.find({ _schemaName: 'List' }).toArray();
  const listMap = {};
  for (const l of lists) listMap[l._id.toString()] = l.name;

  const projId = new ObjectId(projectId);
  const query = { _schemaName: 'Document', project: projId };
  if (!includeAll) query.eaoStatus = 'Published';

  const docs = await col.find(query, {
    projection: {
      displayName: 1, documentFileName: 1,
      legislation: 1, type: 1,
      documentAuthor: 1, documentAuthorType: 1,
      milestone: 1, projectPhase: 1,
      datePosted: 1, dateUploaded: 1, description: 1,
      eaoStatus: 1, labels: 1,
    },
  }).sort({ datePosted: 1 }).toArray();

  const rows = [
    'Document Name,Legislation,Document Type,Author,Milestone,Project Phase,Document Date,Upload Date,Description,Labels',
  ];

  for (const doc of docs) {
    const name    = doc.displayName || doc.documentFileName || '';
    const leg     = doc.legislation || '';
    const docType = doc.type
      ? (listMap[doc.type.toString()] || '') : '';
    const author  = doc.documentAuthor
      || (doc.documentAuthorType ? (listMap[doc.documentAuthorType.toString()] || '') : '');
    const ms      = doc.milestone    ? (listMap[doc.milestone.toString()]    || '') : '';
    const phase   = doc.projectPhase ? (listMap[doc.projectPhase.toString()] || '') : '';
    const docDate = fmtDate(doc.datePosted);
    const upDate  = fmtDate(doc.dateUploaded);
    const desc    = doc.description || '';
    const tags    = (Array.isArray(doc.labels) ? doc.labels.filter(Boolean) : []).join('; ');

    rows.push([name, leg, docType, author, ms, phase, docDate, upDate, desc, tags].map(csvEscape).join(','));
  }

  return rows.join('\n') + '\n';
}

module.exports = { exportProjectDocs };
