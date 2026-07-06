'use strict';

// The batch feature's store-only zip writer lives in index.html between
// ZIP-LIB markers. Extract it (harness-style) and check the output is a
// structurally valid zip with correct CRCs. buildZip returns a Blob,
// whose reader is async — the sync runner delegates to a child process.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test, assert, assertEq } = require('./runner');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function zipLib() {
  const start = html.indexOf('// ZIP-LIB start');
  const end = html.indexOf('// ZIP-LIB end');
  assert(start > 0 && end > start, 'ZIP-LIB markers not found in index.html');
  return html.slice(start, end);
}

test('zip: crc32 matches the known value for "hello world"', () => {
  const lib = new Function(zipLib() + '\nreturn { crc32 };')();
  const bytes = new TextEncoder().encode('hello world');
  assertEq(lib.crc32(bytes), 0x0D4A1185);
});

test('zip: buildZip emits a structurally valid archive', () => {
  const script = `
    const html = require('node:fs').readFileSync(${JSON.stringify(path.join(ROOT, 'index.html'))}, 'utf8');
    const src = html.slice(html.indexOf('// ZIP-LIB start'), html.indexOf('// ZIP-LIB end'));
    const { buildZip } = new Function(src + '\\nreturn { buildZip };')();
    (async () => {
      const blob = buildZip([
        { name: 'a.json', text: '[{"x": 1}]' },
        { name: 'b.csv', text: 'x\\n1\\n' },
      ]);
      const buf = Buffer.from(await blob.arrayBuffer());
      // Local file header at 0, EOCD at the end, 2 central entries.
      if (buf.readUInt32LE(0) !== 0x04034B50) throw new Error('missing local header sig');
      const eocd = buf.length - 22;
      if (buf.readUInt32LE(eocd) !== 0x06054B50) throw new Error('missing EOCD sig');
      if (buf.readUInt16LE(eocd + 10) !== 2) throw new Error('wrong entry count');
      const cdStart = buf.readUInt32LE(eocd + 16);
      if (buf.readUInt32LE(cdStart) !== 0x02014B50) throw new Error('missing central dir sig');
      const name = buf.toString('utf8', 30, 30 + buf.readUInt16LE(26));
      if (name !== 'a.json') throw new Error('wrong first entry name: ' + name);
      console.log('ZIP OK');
    })().catch(e => { console.error(e.message); process.exit(1); });
  `;
  const out = execFileSync(process.execPath, ['-e', script]).toString();
  assert(out.includes('ZIP OK'), 'zip structure check failed');
});
