'use strict';

const { test, assert, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('json: parses objects, arrays, and scalars', () => {
  assertEq(PARSERS.json('{"a": 1, "b": [true, null, "x"]}'), { a: 1, b: [true, null, 'x'] });
  assertEq(PARSERS.json('[1, 2, 3]'), [1, 2, 3]);
  assertEq(PARSERS.json('42'), 42);
  assertEq(PARSERS.json('"hello"'), 'hello');
  assertEq(PARSERS.json('null'), null);
});

test('json: round-trips a deeply nested value', () => {
  const value = {
    name: 'Tooly',
    version: '1.2',
    nested: { a: { b: { c: [1, 2.5, { d: 'deep', e: [null, false] }] } } },
    unicode: 'héllo wörld — 日本語 🎉',
  };
  const out = SERIALIZERS.json(value, { jsonIndent: 2 });
  assertEq(PARSERS.json(out), value);
});

test('json: accepts JSONC line and block comments', () => {
  const input = [
    '{',
    '  // line comment',
    '  "a": 1, /* block comment */',
    '  "b": "two" // trailing',
    '}',
  ].join('\n');
  assertEq(PARSERS.json(input), { a: 1, b: 'two' });
});

test('json: accepts trailing commas', () => {
  assertEq(PARSERS.json('{"a": 1, "b": [1, 2,],}'), { a: 1, b: [1, 2] });
  assertEq(PARSERS.json('[1, 2, 3,\n]'), [1, 2, 3]);
});

test('json: comment markers inside strings are preserved', () => {
  const input = '{"url": "https://example.com/a", "note": "not /* a */ comment // here"}';
  assertEq(PARSERS.json(input), {
    url: 'https://example.com/a',
    note: 'not /* a */ comment // here',
  });
});

test('json: escaped quotes inside strings do not break JSONC stripping', () => {
  const input = '{"quote": "she said \\"hi\\", // ok", }';
  assertEq(PARSERS.json(input), { quote: 'she said "hi", // ok' });
});

test('json: still throws on genuinely malformed input', () => {
  assertThrows(() => PARSERS.json('{'));
  assertThrows(() => PARSERS.json('{"a": }'));
  assertThrows(() => PARSERS.json(''));
});

test('json: serializer honors the indent option', () => {
  const compact = SERIALIZERS.json({ a: 1 }, { jsonIndent: 0 });
  assertEq(compact, '{"a":1}');
  const four = SERIALIZERS.json({ a: 1 }, { jsonIndent: 4 });
  assert(four.includes('    "a": 1'), 'expected 4-space indent, got ' + JSON.stringify(four));
});

test('json → yaml and back preserves the value', () => {
  const input = '{"name": "Tooly", "version": "1.2", "tools": ["compress", "json", "regex"]}';
  const yaml = convert(input, 'json', 'yaml');
  const back = PARSERS.json(convert(yaml, 'yaml', 'json'));
  assertEq(back, PARSERS.json(input));
});
