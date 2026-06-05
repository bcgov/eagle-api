#!/usr/bin/env node
/**
 * Export all documents for an EPIC project to CSV (stdout).
 *
 * USAGE:
 *   node tools/export-project-docs.js <projectId> [--all]
 *
 *   <projectId>  MongoDB ObjectId of the project (required)
 *   --all        Include non-Published documents (Rejected, draft, etc.)
 *                Default: Published only
 *
 * EXAMPLES:
 *   # Run directly (requires MongoDB env vars)
 *   node tools/export-project-docs.js 5d40cc5b4cb2c7001b1336b8 > docs.csv
 *
 *   # Run inside eagle-api pod via oc exec (no env setup needed)
 *   oc exec -n 6cdc9e-prod -i <pod> -- node - < tools/export-project-docs.js -- 5d40cc5b4cb2c7001b1336b8 > docs.csv
 *
 *   # With oc port-forward (local MongoDB tunnel)
 *   oc port-forward svc/eagle-api-mongodb 27017:27017 -n 6cdc9e-prod &
 *   MONGODB_SERVICE_HOST=localhost node tools/export-project-docs.js 5d40cc5b4cb2c7001b1336b8 > docs.csv
 *
 * ENV VARS (read from pod environment automatically when using oc exec):
 *   MONGODB_DATABASE_URL   Full connection URI (takes priority)
 *   MONGODB_SERVICE_HOST   MongoDB hostname (default: localhost)
 *   MONGODB_PORT           MongoDB port (default: 27017)
 *   MONGODB_DATABASE       Database name (default: epic)
 *   MONGODB_USERNAME       Username (optional)
 *   MONGODB_PASSWORD       Password (optional)
 *   MONGODB_AUTHSOURCE     Auth DB (default: admin)
 *
 * NOTE: All EPIC data lives in a single 'epic' collection, discriminated by _schemaName.
 */

'use strict';

const { MongoClient, ObjectId } = require('mongodb');

// --- CLI args ---
const args = process.argv.slice(2);
const projectId = args.find(a => !a.startsWith('--'));
const includeAll = args.includes('--all');

if (!projectId) {
  process.stderr.write('Usage: node tools/export-project-docs.js <projectId> [--all]\n');
  process.exit(1);
}

if (!ObjectId.isValid(projectId)) {
  process.stderr.write(`Invalid projectId: ${projectId}\n`);
  process.exit(1);
}

// --- MongoDB connection ---
function buildUri() {
  if (process.env.MONGODB_DATABASE_URL) return process.env.MONGODB_DATABASE_URL;
  const host = process.env.MONGODB_SERVICE_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || 27017;
  const db   = process.env.MONGODB_DATABASE || 'epic';
  const user = process.env.MONGODB_USERNAME || '';
  const pass = process.env.MONGODB_PASSWORD || '';
  const auth = process.env.MONGODB_AUTHSOURCE || 'admin';
  return user
    ? `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}?authSource=${auth}`
    : `mongodb://${host}:${port}/${db}`;
}

// --- CSV helpers ---
function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/\r?\n/g, ' ');
  return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
}

// --- Main ---
async function main() {
  const dbName = process.env.MONGODB_DATABASE || 'epic';
  const client = new MongoClient(buildUri(), { serverSelectionTimeoutMS: 10000 });
  await client.connect();

  const col = client.db(dbName).collection('epic');

  // Load all list items for ID → name resolution
  const lists = await col.find({ _schemaName: 'List' }).toArray();
  const listMap = {};
  for (const l of lists) listMap[l._id.toString()] = l.name;

  // Build document query
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

  // CSV output
  process.stdout.write('Document Name,Legislation,Document Type,Author,Milestone,Project Phase,Document Date,Upload Date,Description,Labels\n');

  for (const doc of docs) {
    const name    = doc.displayName || doc.documentFileName || '';
    const leg     = doc.legislation || '';
    const docType = doc.type            ? (listMap[doc.type.toString()]            || '') : '';
    const author  = doc.documentAuthor  || (doc.documentAuthorType ? (listMap[doc.documentAuthorType.toString()] || '') : '');
    const ms      = doc.milestone       ? (listMap[doc.milestone.toString()]       || '') : '';
    const phase   = doc.projectPhase    ? (listMap[doc.projectPhase.toString()]    || '') : '';
    const docDate = fmtDate(doc.datePosted);
    const upDate  = fmtDate(doc.dateUploaded);
    const desc    = doc.description || '';
    const tags    = (Array.isArray(doc.labels) ? doc.labels.filter(Boolean) : []).join('; ');

    process.stdout.write([name, leg, docType, author, ms, phase, docDate, upDate, desc, tags].map(csvEscape).join(',') + '\n');
  }

  process.stderr.write(`Done. ${docs.length} document(s) exported for project ${projectId}.\n`);
  await client.close();
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
