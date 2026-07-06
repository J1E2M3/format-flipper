'use strict';

// Registry-consistency sweep: a format is registered in several places
// that nothing ties together at runtime — PARSERS/SERIALIZERS (the
// engine), FORMAT_LABELS (also the validity gate for settings links),
// FORMAT_EXT (downloads), and the two hardcoded <select> option lists.
// A miss in any of them fails silently in the browser; this test makes
// it fail loudly here instead.

const fs = require('node:fs');
const path = require('node:path');
const { test, assertEq, assert } = require('./runner');
const { PARSERS, SERIALIZERS } = require('./harness');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const canonical = Object.keys(PARSERS).sort();

function literalKeys(name) {
  const m = html.match(new RegExp('const ' + name + ' = \\{([^}]*)\\}'));
  assert(m, `could not find "const ${name} = {...}" in index.html`);
  return [...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map(x => x[1]).sort();
}

function selectOptions(id) {
  const m = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
  assert(m, `could not find <select id="${id}"> in index.html`);
  return [...m[1].matchAll(/<option value="([^"]+)"/g)].map(x => x[1]).sort();
}

test('registry: SERIALIZERS keys match PARSERS keys', () => {
  assertEq(Object.keys(SERIALIZERS).sort(), canonical);
});

test('registry: FORMAT_LABELS covers exactly the registered formats', () => {
  assertEq(literalKeys('FORMAT_LABELS'), canonical);
});

test('registry: FORMAT_EXT covers exactly the registered formats', () => {
  assertEq(literalKeys('FORMAT_EXT'), canonical);
});

test('registry: #fromSelect options match the registered formats', () => {
  assertEq(selectOptions('fromSelect'), canonical);
});

test('registry: #toSelect options match the registered formats', () => {
  assertEq(selectOptions('toSelect'), canonical);
});
