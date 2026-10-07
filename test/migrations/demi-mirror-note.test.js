/**
 * Every migration from CUTOFF on that names a record type DEMI mirrors must say, in a `DEMI:`
 * paragraph of its header comment, how DEMI gets the change (migrations/README.md, "Migrations that
 * touch DEMI mirrored records"). A migration writes Mongo directly, so no push fires.
 *
 * The check reads file text only: a `_schemaName` built at run time is not seen.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');

const { KINDS } = require('../../scripts/demi-repush');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
// Older migrations predate the rule and are not checked.
const CUTOFF = '20260923000000';
// List has no KINDS entry: eagle-api never pushes it, eagle-demi's seed script is its only writer.
const LIST_SCHEMA = 'List';
const LIST_SEED = 'seed-public-reads.js --only lists';
const REPUSH = 'scripts/demi-repush.js';

const MIGRATION_FILE = /^(\d{14})-.+\.js$/;
const COMMENT_LINE = /^(\/\/|\/\*|\*)/;
const USE_STRICT = /^['"]use strict['"];?$/;

// Header = the comment lines before the first line of code, markers stripped, blanks kept as ''.
const headerLines = source => {
  const lines = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line === '' || USE_STRICT.test(line)) {
      lines.push('');
    } else if (COMMENT_LINE.test(line)) {
      lines.push(line.replace(/^(\/\/+|\/\*+|\*+\/?)/, '').replace(/\*\/$/, '').trim());
    } else {
      break;
    }
  }
  return lines;
};

// The `DEMI:` paragraph, joined into one string, or null when there is none.
const demiNote = source => {
  const lines = headerLines(source);
  const start = lines.findIndex(line => line.startsWith('DEMI:'));
  if (start === -1) {
    return null;
  }
  const end = lines.findIndex((line, index) => index > start && line === '');
  return lines.slice(start, end === -1 ? undefined : end).join(' ').slice('DEMI:'.length).trim();
};

// Kinds a note asks demi-repush.js for, from `--kind a` and `--kinds a,b`.
const namedKinds = note => {
  const named = new Set();
  for (const match of note.matchAll(/--kinds?\s+([\w,]+)/g)) {
    match[1].split(',').filter(Boolean).forEach(kind => named.add(kind));
  }
  return named;
};

const namesString = (source, value) => new RegExp(`(['"\`])${value}\\1`).test(source);

const problemsIn = (file, source, kinds) => {
  const mirrored = Object.keys(kinds).filter(key => namesString(source, kinds[key].schemaName));
  const namesList = namesString(source, LIST_SCHEMA);
  if (mirrored.length === 0 && !namesList) {
    return [];
  }

  const wanted = mirrored.map(key => `${REPUSH} --kind ${key}`).concat(namesList ? [LIST_SEED] : []);
  const note = demiNote(source);
  if (note === null) {
    return [`${file}: no DEMI: note in the header comment; it needs ${wanted.join(', ')}`];
  }

  const none = note.match(/^none\b[\s,.:;-]*(.*)$/);
  if (none) {
    return none[1] ? [] : [`${file}: DEMI: none needs a reason`];
  }

  const named = namedKinds(note);
  return []
    .concat(mirrored.length && !note.includes(REPUSH) ? [`${file}: DEMI: note does not name ${REPUSH}`] : [])
    .concat(mirrored.filter(key => !named.has(key)).map(key => `${file}: DEMI: note does not name --kind ${key}`))
    .concat(namesList && !note.includes(LIST_SEED) ? [`${file}: DEMI: note does not name ${LIST_SEED}`] : []);
};

// Every problem across the migrations in `dir` dated CUTOFF or later.
const checkMirrorNotes = (dir, kinds = KINDS) => fs.readdirSync(dir)
  .filter(file => (file.match(MIGRATION_FILE) || [])[1] >= CUTOFF)
  .sort()
  .flatMap(file => problemsIn(file, fs.readFileSync(path.join(dir, file), 'utf8'), kinds));

const DOCUMENT_UPDATE = "module.exports = { up: db => db.collection('epic').updateMany({ _schemaName: 'Document' }, { $set: { a: 1 } }) };\n";
const LIST_INSERT = "module.exports = { up: db => db.collection('epic').insertOne({ _schemaName: 'List', type: 't', name: 'n' }) };\n";

describe('migrations: DEMI re-push note', () => {
  let dir;

  const fixture = files => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demi-mirror-note-'));
    Object.entries(files).forEach(([name, body]) => fs.writeFileSync(path.join(dir, name), body));
    return dir;
  };

  afterEach(() => {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it('passes every migration in this repo', () => {
    expect(checkMirrorNotes(MIGRATIONS_DIR)).to.deep.equal([]);
  });

  it('flags a Document migration with no note', () => {
    const problems = checkMirrorNotes(fixture({ '20261001000000-docs.js': DOCUMENT_UPDATE }));

    expect(problems).to.deep.equal([
      `20261001000000-docs.js: no DEMI: note in the header comment; it needs ${REPUSH} --kind document`
    ]);
  });

  it('accepts a Document migration whose note names the re-push', () => {
    const body = `// Sets a.\n//\n// DEMI: run ${REPUSH} --kind document\n// --since 2026-10-01 after this.\n\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([]);
  });

  it('flags a note that names the script but a different kind', () => {
    const body = `'use strict';\n\n// DEMI: ${REPUSH} --kinds project,comment\n\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([
      '20261001000000-docs.js: DEMI: note does not name --kind document'
    ]);
  });

  it('flags a note that names the kind but not the script', () => {
    const body = `// DEMI: re-push with --kind document after this.\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([
      `20261001000000-docs.js: DEMI: note does not name ${REPUSH}`
    ]);
  });

  it('reads only the DEMI: paragraph, up to the next blank comment line', () => {
    const body = `// DEMI: run ${REPUSH} after this.\n//\n// Later paragraph: --kind document\n\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([
      '20261001000000-docs.js: DEMI: note does not name --kind document'
    ]);
  });

  it('takes the mirrored types from KINDS', () => {
    const body = "module.exports = { up: db => db.collection('epic').updateMany({ _schemaName: 'Widget' }, {}) };\n";
    const kinds = { widget: { schemaName: 'Widget' } };

    expect(checkMirrorNotes(fixture({ '20261001000000-widgets.js': body }), kinds)).to.have.lengthOf(1);
  });

  it('leaves migrations dated before the cutoff alone', () => {
    expect(checkMirrorNotes(fixture({ '20260922235959-docs.js': DOCUMENT_UPDATE }))).to.deep.equal([]);
  });

  it('checks a migration dated exactly at the cutoff', () => {
    expect(checkMirrorNotes(fixture({ '20260923000000-docs.js': DOCUMENT_UPDATE }))).to.deep.equal([
      `20260923000000-docs.js: no DEMI: note in the header comment; it needs ${REPUSH} --kind document`
    ]);
  });

  it('flags a List migration whose note skips the List seed', () => {
    const body = `// DEMI: ${REPUSH} --kinds project,document\n${LIST_INSERT}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-list.js': body }))).to.deep.equal([
      `20261001000000-list.js: DEMI: note does not name ${LIST_SEED}`
    ]);
  });

  it('accepts a List migration whose note names the List seed', () => {
    const body = `/*\n * DEMI: run eagle-demi ${LIST_SEED} --live. No names change.\n */\n${LIST_INSERT}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-list.js': body }))).to.deep.equal([]);
  });

  it('accepts DEMI: none with a reason', () => {
    const body = `// DEMI: none, reads Document rows only to build an index.\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([]);
  });

  it('flags DEMI: none with no reason', () => {
    const body = `// DEMI: none\n${DOCUMENT_UPDATE}`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.deep.equal([
      '20261001000000-docs.js: DEMI: none needs a reason'
    ]);
  });

  it('ignores a DEMI: line below the header comment', () => {
    const body = `${DOCUMENT_UPDATE}// DEMI: ${REPUSH} --kind document\n`;

    expect(checkMirrorNotes(fixture({ '20261001000000-docs.js': body }))).to.have.lengthOf(1);
  });
});
