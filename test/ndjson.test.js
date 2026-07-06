'use strict';

const { test, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('ndjson: parses one JSON value per line and skips blank lines', () => {
  const input = '{"id": 1}\n\n{"id": 2}\n   \n[1, 2]\n"str"\n42\n';
  assertEq(PARSERS.ndjson(input), [{ id: 1 }, { id: 2 }, [1, 2], 'str', 42]);
});

test('ndjson: parse errors carry the line number', () => {
  assertThrows(() => PARSERS.ndjson('{"ok": 1}\n{nope}'), /NDJSON line 2/);
});

test('ndjson: is strict — JSONC comments are rejected', () => {
  assertThrows(() => PARSERS.ndjson('{"a": 1} // comment'), /NDJSON line 1/);
});

test('ndjson: serializes an array as one compact line per element', () => {
  const out = SERIALIZERS.ndjson([{ a: 1 }, { b: 'x' }]);
  assertEq(out, '{"a":1}\n{"b":"x"}');
});

test('ndjson: non-array values serialize as a single line', () => {
  assertEq(SERIALIZERS.ndjson({ a: 1 }), '{"a":1}');
  assertEq(SERIALIZERS.ndjson('hello'), '"hello"');
});

test('ndjson: empty input round-trips as an empty array', () => {
  assertEq(PARSERS.ndjson(''), []);
  assertEq(SERIALIZERS.ndjson([]), '');
});

test('ndjson: round-trips records including unicode and nesting', () => {
  const records = [
    { id: 1, name: 'héllo — 日本語 🎉', nested: { deep: [1, null, false] } },
    { id: 2, name: 'plain' },
  ];
  assertEq(PARSERS.ndjson(SERIALIZERS.ndjson(records)), records);
});

test('ndjson ↔ json cross-format conversions', () => {
  const json = convert('{"a": 1}\n{"a": 2}', 'ndjson', 'json');
  assertEq(PARSERS.json(json), [{ a: 1 }, { a: 2 }]);

  const ndjson = convert('[{"a": 1}, {"a": 2}]', 'json', 'ndjson');
  assertEq(ndjson, '{"a":1}\n{"a":2}');
});

test('ndjson → csv cross-format conversion', () => {
  assertEq(convert('{"id": 1, "name": "Ada"}\n{"id": 2, "name": "Grace"}', 'ndjson', 'csv'), 'id,name\n1,Ada\n2,Grace');
});
