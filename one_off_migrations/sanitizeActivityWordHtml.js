/**
 * One-off migration: sanitize Word/Word-Online HTML in RecentActivity content fields.
 *
 * Strips inline styles, Word-specific class names (MsoNormal, OutlineElement, SCXW*, BCX*,
 * TextRun, NormalTextRun, Paragraph), language annotations, and bare <div>/<span> wrappers
 * that result from pasting content copied from Microsoft Word or SharePoint into TinyMCE.
 *
 * Safe to re-run — updates are only written when content actually changes.
 *
 * Usage:
 *   MONGODB_URI=mongodb://userWKS:<password>@localhost:5555/epic node one_off_migrations/sanitizeActivityWordHtml.js
 *
 * Or via port-forward from OpenShift:
 *   oc port-forward svc/eagle-api-mongodb 5555:27017 -n 6cdc9e-prod &
 *   MONGODB_URI='mongodb://userWKS:<password>@localhost:5555/epic?authSource=admin' \
 *     node one_off_migrations/sanitizeActivityWordHtml.js
 */

'use strict';

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/epic';

/**
 * Sanitizes HTML content that was pasted from Microsoft Word or Word Online.
 * Mirrors the logic in eagle-public/src/app/shared/utils/word-html-sanitizer.ts
 */
function sanitizeWordHtml(html) {
  if (!html) return html;

  let clean = html;

  // 1. Remove all inline style attributes
  clean = clean.replace(/ style="[^"]*"/gi, '');
  clean = clean.replace(/ style='[^']*'/gi, '');

  // 2. Remove all class attributes
  clean = clean.replace(/ class="[^"]*"/gi, '');
  clean = clean.replace(/ class='[^']*'/gi, '');

  // 3. Remove lang / xml:lang attributes
  clean = clean.replace(/ (lang|xml:lang)="[^"]*"/gi, '');

  // 4. Remove data-* attributes
  clean = clean.replace(/ data-[a-z][a-z0-9-]*="[^"]*"/gi, '');

  // 5. Unwrap bare <div> and <span> tags (no remaining attributes)
  let prev = '';
  while (prev !== clean) {
    prev = clean;
    clean = clean.replace(/<(div|span)\s*>/gi, '');
    clean = clean.replace(/<\/(div|span)>/gi, '');
  }

  // 6. Collapse excessive whitespace
  clean = clean.replace(/\n{3,}/g, '\n\n');
  clean = clean.replace(/[ \t]{2,}/g, ' ');

  // 7. Remove empty <p> tags
  clean = clean.replace(/<p>(\s|&nbsp;)*<\/p>/gi, '');

  return clean.trim();
}

async function run() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/[^@]+@/, '//***@'));

    const db = client.db();
    const collection = db.collection('epic');

    // Fetch all RecentActivity records that have content
    const activities = await collection
      .find({ _schemaName: 'RecentActivity', content: { $exists: true, $ne: null, $ne: '' } })
      .toArray();

    console.log(`Found ${activities.length} RecentActivity records with content.`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const activity of activities) {
      try {
        const original = activity.content;
        const sanitized = sanitizeWordHtml(original);

        if (sanitized === original) {
          skipped++;
          continue;
        }

        await collection.updateOne(
          { _id: activity._id },
          { $set: { content: sanitized } }
        );

        console.log(`  Updated: ${activity._id} — "${(activity.headline || '').slice(0, 60)}"`);
        updated++;
      } catch (err) {
        console.error(`  ERROR on ${activity._id}:`, err.message);
        errors++;
      }
    }

    console.log('\n=== Migration complete ===');
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (already clean): ${skipped}`);
    console.log(`  Errors: ${errors}`);
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
