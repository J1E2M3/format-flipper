'use strict';

// Cross-format sweep: drive the star topology through every format pair
// and check that the intermediate value survives wherever the target
// format can represent it.

const { test, assert, assertEq } = require('./runner');
const { PARSERS, SERIALIZERS, convert, DEFAULT_OPTS } = require('./harness');

const ALL_FORMATS = ['json', 'yaml', 'toml', 'csv', 'tsv', 'xml', 'md', 'html', 'sql'];

// Formats that can faithfully hold an array of flat records.
const TABULAR = ['json', 'yaml', 'csv', 'tsv', 'xml', 'md', 'html', 'sql'];

const RECORDS = [
  { id: 1, name: 'Ada Lovelace', active: true, score: 9.5 },
  { id: 2, name: 'Grace Hopper', active: false, score: 8.75 },
];

test('registry: all 9 formats have a parser and a serializer', () => {
  assertEq(Object.keys(PARSERS).sort(), [...ALL_FORMATS].sort());
  assertEq(Object.keys(SERIALIZERS).sort(), [...ALL_FORMATS].sort());
});

test('matrix: records survive every tabular-format pair (8 × 8 = 64 paths)', () => {
  const inputs = {};
  for (const fmt of TABULAR) {
    inputs[fmt] = SERIALIZERS[fmt](RECORDS, DEFAULT_OPTS);
  }
  for (const from of TABULAR) {
    for (const to of TABULAR) {
      const output = convert(inputs[from], from, to);
      assertEq(
        PARSERS[to](output),
        RECORDS,
        `${from} → ${to}`
      );
    }
  }
});

const CONFIG = {
  title: 'Format Flipper',
  owner: { name: 'Tooly', active: true },
  servers: [
    { host: 'alpha', port: 8001 },
    { host: 'beta', port: 8002 },
  ],
};

// Formats that can hold a nested object hierarchy.
const HIERARCHICAL = ['json', 'yaml', 'toml', 'xml'];

test('matrix: nested config survives every hierarchical-format pair (4 × 4 = 16 paths)', () => {
  const inputs = {};
  for (const fmt of HIERARCHICAL) {
    inputs[fmt] = SERIALIZERS[fmt](CONFIG, { ...DEFAULT_OPTS, xmlRoot: 'config' });
  }
  for (const from of HIERARCHICAL) {
    for (const to of HIERARCHICAL) {
      const value = PARSERS[from](inputs[from]);
      const output = SERIALIZERS[to](value, { ...DEFAULT_OPTS, xmlRoot: 'config' });
      assertEq(PARSERS[to](output), CONFIG, `${from} → ${to}`);
    }
  }
});

test('matrix: shape mismatches fail loudly, not silently', () => {
  // A top-level array cannot become TOML …
  let threw = false;
  try {
    convert('[1, 2, 3]', 'json', 'toml');
  } catch (err) {
    threw = true;
    assert(/top-level object/.test(err.message), 'unexpected message: ' + err.message);
  }
  assert(threw, 'json array → toml should throw');

  // … and a plain object cannot become a CSV table.
  threw = false;
  try {
    convert('{"a": 1}', 'json', 'csv');
  } catch (err) {
    threw = true;
    assert(/array of records/.test(err.message), 'unexpected message: ' + err.message);
  }
  assert(threw, 'json object → csv should throw');
});
