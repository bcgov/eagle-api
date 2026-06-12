'use strict';

/**
 * documentChunker.js — Turn docling markdown into DocumentChunk records.
 *
 * Ported from eagle-demi/src/extract.js (chunker.js + replaceChunks +
 * markDocument) so the DEMI on-upload path (jobQueue demi-extract) writes the
 * exact same DocumentChunk shape as the eagle-demi bulk worker. eagle-typesense
 * indexes these chunks (QUERY_BY / FACET_BY) — the two writers MUST stay in
 * sync. If the chunk shape changes here, change it in eagle-demi too.
 *
 * Chunk sizing matches the eagle-demi worker env defaults.
 */

const { ObjectId } = require('mongodb');

const MAX_CHUNK_SIZE = parseInt(process.env.MAX_CHUNK_SIZE || '4000', 10);
const MIN_CHUNK_SIZE = parseInt(process.env.MIN_CHUNK_SIZE || '100', 10);
const OVERLAP_SIZE   = parseInt(process.env.OVERLAP_SIZE   || '200', 10);

/**
 * Split a single block of text into overlapping sub-chunks.
 * @param {string} text
 * @returns {string[]}
 */
function splitText(text) {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const chunks = [];
  const step   = MAX_CHUNK_SIZE - OVERLAP_SIZE;
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
  }
  return chunks;
}

/**
 * Convert docling markdown into chunks.
 * Split on double-newline (sections), merge tiny sections, sub-split long ones.
 * @param {string} markdown
 * @returns {{ pageNumber: number, chunkIndex: number, content: string }[]}
 */
function chunkMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return [];

  const sections = markdown.split(/\n{2,}/).map(s => s.trim()).filter(s => s.length >= MIN_CHUNK_SIZE);

  const merged = [];
  for (const section of sections) {
    if (merged.length > 0 && merged[merged.length - 1].length < MIN_CHUNK_SIZE) {
      merged[merged.length - 1] += '\n\n' + section;
    } else {
      merged.push(section);
    }
  }

  const result = [];
  let pageNumber = 0;
  let chunkIndex = 0;

  for (const block of merged) {
    const subChunks = splitText(block);
    for (const sub of subChunks) {
      if (sub.trim().length < MIN_CHUNK_SIZE) continue;
      result.push({ pageNumber, chunkIndex, content: sub.trim() });
      chunkIndex++;
    }
    pageNumber++;
  }

  return result;
}

/**
 * Resolve a List-item ObjectId to its display label, if a lookup is provided.
 */
function resolveLabel(val, listLookup) {
  if (!val) return undefined;
  const s = val.toString();
  if (listLookup && listLookup.has(s)) return listLookup.get(s);
  return s;
}

/**
 * Build an id->name lookup for List items (document type, milestone, etc.).
 * @param {import('mongodb').Db} db
 * @returns {Promise<Map<string,string>>}
 */
async function buildListLookup(db) {
  const lists = await db.collection('epic')
    .find({ _schemaName: 'List' }, { projection: { _id: 1, name: 1 } })
    .toArray();
  return new Map(lists.map(l => [l._id.toString(), l.name || '']));
}

/**
 * Delete existing chunks for a document and insert fresh ones.
 * Mirrors eagle-demi/src/extract.js replaceChunks — keep the record shape in sync.
 * @returns {Promise<number>} number of chunks written
 */
async function writeChunks(db, docId, doc, markdown, projectName, listLookup) {
  const col = db.collection('epic');
  const oid = new ObjectId(docId);

  await col.deleteMany({ _schemaName: 'DocumentChunk', document: oid });

  const pageChunks = chunkMarkdown(markdown);
  if (pageChunks.length === 0) return 0;

  const records = pageChunks.map(({ pageNumber, chunkIndex, content }) => ({
    _schemaName:  'DocumentChunk',
    document:     oid,
    project:      doc.project || undefined,
    pageNumber,
    chunkIndex,
    content,
    documentName: doc.displayName || doc.documentFileName || '',
    projectName:  projectName || undefined,
    documentType: resolveLabel(doc.type, listLookup),
    milestone:    resolveLabel(doc.milestone, listLookup),
    datePosted:   doc.datePosted || undefined,
    read:         doc.read,
    dateAdded:    Date.now(),
  }));

  await col.insertMany(records, { ordered: false });
  return records.length;
}

/**
 * Mark a Document with its extraction outcome.
 */
async function markDocument(db, docId, pageCount, error) {
  const col = db.collection('epic');
  const update = error
    ? { $set: { contentExtracted: true, contentExtractedAt: new Date(), contentPageCount: 0, contentExtractionError: String(error), extractionMethod: 'docling' } }
    : { $set: { contentExtracted: true, contentExtractedAt: new Date(), contentPageCount: pageCount, contentExtractionError: null, extractionMethod: 'docling' } };
  await col.updateOne({ _id: new ObjectId(docId) }, update);
}

module.exports = { chunkMarkdown, writeChunks, markDocument, buildListLookup };
