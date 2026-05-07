'use strict';

/**
 * Chunking logic for PDF page text.
 *
 * Strategy: page-based with overlap.
 *  - Primary grain: 1 page = 1 chunk
 *  - If page > MAX_CHUNK_SIZE chars: split into sub-chunks with OVERLAP_SIZE overlap
 *  - If page < MIN_CHUNK_SIZE chars: merge with next page
 *  - Pages beyond MAX_PAGES_PER_DOC are skipped (e.g. enormous appendix packs)
 *
 * Why pages:
 *  - Clean source attribution ("page 7")
 *  - Natural topic boundaries
 *  - AI embeddings work well with page-sized chunks
 */

const MAX_CHUNK_SIZE    = parseInt(process.env.MAX_CHUNK_SIZE    || '4000', 10);
const MIN_CHUNK_SIZE    = parseInt(process.env.MIN_CHUNK_SIZE    || '100',  10);
const OVERLAP_SIZE      = parseInt(process.env.OVERLAP_SIZE      || '200',  10);
const MAX_PAGES_PER_DOC = parseInt(process.env.MAX_PAGES_PER_DOC || '200',  10);

/**
 * Split a single page's text into one or more sub-chunks.
 * Each sub-chunk overlaps with the previous by OVERLAP_SIZE chars.
 *
 * @param {string} text - Page text
 * @returns {string[]} Array of chunk strings
 */
function splitPage(text) {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  const chunks = [];
  let start = 0;
  const step = MAX_CHUNK_SIZE - OVERLAP_SIZE;

  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += step;
  }

  return chunks;
}

/**
 * Convert pdf-parse page-text array into DocumentChunk-ready objects.
 *
 * @param {string[]} pages - Array of page text strings (index 0 = page 1)
 * @returns {{ pageNumber: number, chunkIndex: number, content: string }[]}
 */
function chunkPages(pages) {
  const chunks = [];
  const capped = pages.slice(0, MAX_PAGES_PER_DOC);

  let pending = '';
  let pendingPage = 1;

  for (let i = 0; i < capped.length; i++) {
    const pageNum  = i + 1;
    const pageText = (capped[i] || '').trim();

    // Merge tiny pages with pending buffer
    if (pageText.length < MIN_CHUNK_SIZE) {
      pending += (pending ? ' ' : '') + pageText;
      continue;
    }

    // Flush pending buffer into this page
    const combined = pending ? `${pending} ${pageText}` : pageText;
    pending = '';
    pendingPage = pageNum + 1;

    const subChunks = splitPage(combined);
    subChunks.forEach((content, idx) => {
      chunks.push({ pageNumber: pageNum, chunkIndex: idx, content });
    });
  }

  // Flush remaining pending text as a final chunk
  if (pending.trim().length > 0) {
    chunks.push({ pageNumber: pendingPage, chunkIndex: 0, content: pending });
  }

  return chunks;
}

module.exports = { chunkPages, MAX_PAGES_PER_DOC };
