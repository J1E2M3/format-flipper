'use strict';

const { test, assert, assertEq } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('yaml: parses mappings, sequences, and scalars', () => {
  const input = ['name: Tooly', 'tools:', '  - json', '  - yaml', 'count: 3', 'ratio: 1.5', 'on: true'].join('\n');
  assertEq(PARSERS.yaml(input), { name: 'Tooly', tools: ['json', 'yaml'], count: 3, ratio: 1.5, on: true });
});

test('yaml: parses a top-level scalar', () => {
  assertEq(PARSERS.yaml('hello'), 'hello');
  assertEq(PARSERS.yaml('42'), 42);
});

test('yaml: round-trips a nested value', () => {
  const value = {
    server: { host: 'localhost', ports: [8080, 8081] },
    flags: { debug: false, verbose: true },
    empty: null,
    unicode: 'crème brûlée ✓',
  };
  assertEq(PARSERS.yaml(SERIALIZERS.yaml(value, {})), value);
});

test('yaml: ambiguous strings stay strings through a round-trip', () => {
  const value = { a: 'yes', b: 'no', c: '1.2', d: 'true', e: '007' };
  assertEq(PARSERS.yaml(SERIALIZERS.yaml(value, {})), value);
});

test('yaml: serializer honors the indent option', () => {
  const out = SERIALIZERS.yaml({ a: { b: 1 } }, { yamlIndent: 4 });
  assert(out.includes('    b: 1'), 'expected 4-space indent, got ' + JSON.stringify(out));
});

test('yaml → json conversion', () => {
  const json = convert('name: Tooly\nversion: "1.2"', 'yaml', 'json');
  assertEq(PARSERS.json(json), { name: 'Tooly', version: '1.2' });
});

test('yaml: empty documents parse to an empty value', () => {
  assert(PARSERS.yaml('\n') == null, 'expected null or undefined');
});
