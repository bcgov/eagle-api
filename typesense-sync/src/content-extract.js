'use strict';

/**
 * content-extract.js — Batch PDF text extraction into DocumentChunk records.
 *
 * For each public Document in MongoDB where:
 *   - internalExt is pdf
 *   - contentExtracted is not true
 *
 * Steps (CONCURRENCY in parallel):
 *   1. Download PDF from NRS Object Store (stream via MinIO SDK)
 *   2. Parse with pdf-parse → per-page text array
 *   3. Apply chunking rules (chunker.js)
 *   4. Bulk-insert chunks into MongoDB epic collection (_schemaName: 'DocumentChunk')
 *   5. Update parent Document: contentExtracted=true, contentPageCount=N
 *   6. On error: mark contentExtractionError, log, continue
 *
 * CLI usage:
 *   node typesense-sync/src/content-extract.js              # full batch (resumable)
 *   node typesense-sync/src/content-extract.js --doc-id <id>  # single document
 *   node typesense-sync/src/content-extract.js --retry-failed  # re-extract failures
 *   node typesense-sync/src/content-extract.js --dry-run       # count eligible only
 *
 * Environment variables:
 *   MONGODB_* (same as full-sync.js)
 *   MINIO_HOST, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME
 *   MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, OVERLAP_SIZE, MAX_PAGES_PER_DOC (see chunker.js)
 *   CONTENT_EXTRACT_CONCURRENCY  - parallel extractions (default: 10)
 */

require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb');
const Minio  = require('minio');
const pdf    = require('pdf-parse');

const { chunkPages } = require('./chunker');
const { buildMongoUri } = require('./config');

// ── Configuration ─────────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.env.CONTENT_EXTRACT_CONCURRENCY || '10', 10);
const BUCKET      = process.env.MINIO_BUCKET_NAME || 'uploads';

const PDF_EXTENSIONS = new Set(['pdf', 'PDF', '.pdf', '.PDF']);

// Public, non-deleted filter — matches full-sync.js PUBLIC_QUERY
const PUBLIC_QUERY = {
  $and: [
    { $or: [{ read: { $in: ['public'] } }, { read: { $exists: false } }] },
    { $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }] },
  ],
};

// ── MinIO client ──────────────────────────────────────────────────────────────

function getMinioClient() {
  return new Minio.Client({
    endPoint:  process.env.MINIO_HOST || 'localhost',
    port:      parseInt(process.env.MINIO_PORT || '443', 10),
    useSSL:    process.env.MINIO_USE_SSL !== 'false',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  });
}

// ── PDF download + parse ──────────────────────────────────────────────────────

/**
 * Download object from MinIO into a Buffer, then parse with pdf-parse.
 * Returns array of page text strings (index 0 = page 1).
 */
async function extractPages(minioClient, objectPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    minioClient.getObject(BUCKET, objectPath, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end',  async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const result = await pdf(buffer, {
            // Return per-page text via pagerender hook
            pagerender: (pageData) => {
              return pageData.getTextContent().then(tc => {
                return tc.items.map(item => item.str).join(' ');
              });
            },
          });
          // pdf-parse puts per-page text in result.text when pagerender is set
          // Fallback: split result.text by form-feed character (common page delimiter)
          const pages = result.numpages > 0
            ? buildPageArray(result)
            : [result.text];
          resolve(pages);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
      stream.on('error', reject);
    });
  });
}

/**
 * Build a per-page array from pdf-parse result.
 * pdf-parse v1.1.1 accumulates page text in result.text (form-feed separated).
 */
function buildPageArray(result) {
  // pdf-parse renders each page's text; result.text contains all pages
  // separated by '\n\n'. Split best-effort by form-feed or double-newline.
  const raw = result.text || '';
  const pages = raw.split(/\f/).map(p => p.trim()).filter(p => p.length > 0);

  // If split produced fewer pages than numpages, fall back to raw as single page
  if (pages.length === 0) return [raw];
  return pages;
}

// ── MongoDB helpers ───────────────────────────────────────────────────────────

async function insertChunks(db, documentId, projectId, doc, pageChunks, projectName) {
  if (pageChunks.length === 0) return 0;

  const now = new Date();
  const records = pageChunks.map(({ pageNumber, chunkIndex, content }) => ({
    _schemaName:  'DocumentChunk',
    documentId:   new ObjectId(documentId),
    projectId:    projectId ? new ObjectId(projectId) : undefined,
    pageNumber,
    chunkIndex,
    content,
    documentName: doc.displayName || doc.documentFileName || '',
    projectName:  projectName || undefined,
    documentType: doc.type || undefined,
    datePosted:   doc.datePosted || undefined,
    read:         doc.read,
    write:        ['sysadmin', 'staff'],
    delete:       ['sysadmin', 'staff'],
    isDeleted:    false,
    _createdDate: now,
  }));

  const epic = db.collection('epic');

  // Upsert by (documentId, pageNumber, chunkIndex) to make re-runs idempotent
  const ops = records.map(r => ({
    updateOne: {
      filter: {
        _schemaName: 'DocumentChunk',
        documentId:  r.documentId,
        pageNumber:  r.pageNumber,
        chunkIndex:  r.chunkIndex,
      },
      update: { $set: r },
      upsert: true,
    },
  }));

  await epic.bulkWrite(ops, { ordered: false });
  return records.length;
}

async function markExtracted(db, docId, pageCount, error) {
  const epic = db.collection('epic');
  const update = error
    ? { $set: { contentExtracted: true, contentExtractedAt: new Date(), contentPageCount: 0, contentExtractionError: String(error) } }
    : { $set: { contentExtracted: true, contentExtractedAt: new Date(), contentPageCount: pageCount, contentExtractionError: null } };

  await epic.updateOne({ _id: new ObjectId(docId) }, update);
}

// ── Per-document extraction ───────────────────────────────────────────────────

async function processDocument(db, minioClient, doc, projectLookup) {
  const docId     = doc._id.toString();
  const objectPath = doc.internalURL;

  if (!objectPath) {
    await markExtracted(db, docId, 0, 'No internalURL');
    return { docId, status: 'skipped', reason: 'no internalURL' };
  }

  try {
    const pages      = await extractPages(minioClient, objectPath);
    const pageChunks = chunkPages(pages);
    const projectName = doc.project ? projectLookup.get(doc.project.toString()) : undefined;
    const count      = await insertChunks(db, docId, doc.project, doc, pageChunks, projectName);
    await markExtracted(db, docId, count, null);

    return { docId, status: 'ok', chunks: count, pages: pages.length };
  } catch (err) {
    const msg = err.message || String(err);
    await markExtracted(db, docId, 0, msg);
    console.warn(`  [WARN] ${docId}: ${msg}`);
    return { docId, status: 'error', error: msg };
  }
}

// ── Concurrency runner ────────────────────────────────────────────────────────

async function runWithConcurrency(items, fn, concurrency) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      results.push(await fn(item));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const docIdArg     = args.includes('--doc-id')      ? args[args.indexOf('--doc-id') + 1]      : null;
  const retryFailed  = args.includes('--retry-failed');
  const dryRun       = args.includes('--dry-run');

  console.log('Content extraction starting:', new Date().toISOString());
  if (dryRun)       console.log('  DRY RUN — no writes');
  if (retryFailed)  console.log('  Mode: retry-failed');
  if (docIdArg)     console.log(`  Mode: single doc ${docIdArg}`);

  const mongoUri = buildMongoUri();
  const mongo    = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const minio    = getMinioClient();

  try {
    await mongo.connect();
    const db   = mongo.db(process.env.MONGODB_DATABASE || 'epic');
    const epic = db.collection('epic');

    // Build query
    let filter = {
      _schemaName: 'Document',
      internalExt: { $in: [...PDF_EXTENSIONS] },
      ...PUBLIC_QUERY,
    };

    if (docIdArg) {
      filter = { _schemaName: 'Document', _id: new ObjectId(docIdArg) };
    } else if (retryFailed) {
      filter.contentExtracted = true;
      filter.contentPageCount = 0;
      filter.contentExtractionError = { $ne: null };
    } else {
      filter.contentExtracted = { $ne: true };
    }

    const total = await epic.countDocuments(filter);
    console.log(`  Eligible documents: ${total}`);

    if (dryRun || total === 0) {
      console.log('Content extraction complete (dry run or nothing to do).');
      return;
    }

    const docs = await epic.find(filter, {
      projection: { _id: 1, internalURL: 1, project: 1, displayName: 1, documentFileName: 1,
                    type: 1, datePosted: 1, read: 1 },
    }).toArray();

    // Build project id→name lookup for denormalizing projectName into chunks
    const projectIds = [...new Set(docs.map(d => d.project).filter(Boolean).map(String))];
    const projectLookup = new Map();
    if (projectIds.length > 0) {
      const projects = await epic.find(
        { _schemaName: 'Project', _id: { $in: projectIds.map(id => new ObjectId(id)) } },
        { projection: { _id: 1, name: 1 } },
      ).toArray();
      projects.forEach(p => projectLookup.set(p._id.toString(), p.name));
    }

    let ok = 0, errors = 0, skipped = 0;

    const results = await runWithConcurrency(docs, async (doc) => {
      const r = await processDocument(db, minio, doc, projectLookup);
      if (r.status === 'ok')      { ok++;      process.stdout.write(`  \r  ${ok + errors + skipped}/${total}...`); }
      if (r.status === 'error')   { errors++; }
      if (r.status === 'skipped') { skipped++; }
      return r;
    }, CONCURRENCY);

    console.log(`\n\nContent extraction complete: ${new Date().toISOString()}`);
    console.log(`  OK: ${ok}  Errors: ${errors}  Skipped: ${skipped}`);

    if (errors > 0) {
      const failed = results.filter(r => r.status === 'error').slice(0, 10);
      console.log('  First failures:', failed.map(r => `${r.docId}: ${r.error}`).join('\n    '));
    }

    // Non-zero exit on errors so Kubernetes marks CronJob as failed
    if (errors > 0 && ok === 0) process.exit(1);

  } finally {
    await mongo.close();
  }
}

main().catch(err => {
  console.error('Content extraction failed:', err);
  process.exit(1);
});
