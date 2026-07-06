'use strict';

// End-to-end smoke for the package + CLI. Run from this directory after
// `npm install` (needs the js-yaml dependency): node cli-smoke.js

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const ff = require('./index.js');
const CLI = path.join(__dirname, 'bin', 'format-flipper.js');

// Library surface
assert.strictEqual(ff.FORMATS.length, 12, 'expected 12 formats');
assert.deepStrictEqual(
  JSON.parse(ff.convert('a: 1\nb: two', 'yaml', 'json')),
  { a: 1, b: 'two' },
  'yaml -> json'
);
assert.match(ff.convert('[{"id":1}]', 'json', 'sql'), /CREATE TABLE `data`/, 'json -> sql');
assert.throws(() => ff.convert('a,b\n1', 'csv', 'json', { strictParse: true }), /row 2/, 'strict csv');

// CLI: stdin -> stdout
const out = execFileSync(process.execPath, [CLI, '-f', 'json', '-t', 'yaml'], {
  input: '{"name": "Tooly", "tools": ["a", "b"]}',
  encoding: 'utf8',
});
assert.match(out, /name: Tooly/, 'cli stdin json -> yaml');
assert.match(out, /- a/, 'cli stdin array item');

// CLI: file with inferred format, --out
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffcli-'));
fs.writeFileSync(path.join(tmp, 'data.csv'), 'id,name\n1,Ada\n2,Grace\n');
execFileSync(process.execPath, [CLI, '-t', 'json', '-o', path.join(tmp, 'data.json'), path.join(tmp, 'data.csv')]);
const roundTrip = JSON.parse(fs.readFileSync(path.join(tmp, 'data.json'), 'utf8'));
assert.deepStrictEqual(roundTrip, [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }], 'cli csv file -> json file');

// CLI: batch --out-dir
fs.writeFileSync(path.join(tmp, 'a.json'), '[{"x": 1}]');
fs.writeFileSync(path.join(tmp, 'b.json'), '[{"x": 2}]');
execFileSync(process.execPath, [CLI, '-t', 'csv', '-d', path.join(tmp, 'out'), path.join(tmp, 'a.json'), path.join(tmp, 'b.json')], { stdio: 'pipe' });
assert.strictEqual(fs.readFileSync(path.join(tmp, 'out', 'a.csv'), 'utf8'), 'x\n1\n', 'batch a.csv');
assert.strictEqual(fs.readFileSync(path.join(tmp, 'out', 'b.csv'), 'utf8'), 'x\n2\n', 'batch b.csv');

// CLI: parse errors land on stderr with exit 1
let failed = false;
try {
  execFileSync(process.execPath, [CLI, '-f', 'json', '-t', 'yaml'], { input: '{nope', stdio: 'pipe' });
} catch (e) {
  failed = true;
}
assert.ok(failed, 'malformed input should exit non-zero');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('CLI SMOKE OK');
