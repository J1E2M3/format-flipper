'use strict';

const { test, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('md: parses a pipe table with type coercion', () => {
  const input = [
    '| id | name | active |',
    '|---|---|---|',
    '| 1 | Ada | true |',
    '| 2 | Grace | false |',
  ].join('\n');
  assertEq(PARSERS.md(input), [
    { id: 1, name: 'Ada', active: true },
    { id: 2, name: 'Grace', active: false },
  ]);
});

test('md: tolerates loose spacing and missing outer pipes', () => {
  const input = ['id | name', '--- | ---', ' 1 |  Ada  '].join('\n');
  assertEq(PARSERS.md(input), [{ id: 1, name: 'Ada' }]);
});

test('md: unescapes pipes and converts <br> to newlines', () => {
  const input = ['| text |', '|---|', '| a \\| b<br>next |'].join('\n');
  assertEq(PARSERS.md(input), [{ text: 'a | b\nnext' }]);
});

test('md: fewer than two lines parses to an empty array', () => {
  assertEq(PARSERS.md(''), []);
  assertEq(PARSERS.md('| just a header |'), []);
});

test('md: serializer escapes pipes and newlines', () => {
  const out = SERIALIZERS.md([{ text: 'a | b', multi: 'l1\nl2' }]);
  assertEq(out, ['| text | multi |', '|---|---|', '| a \\| b | l1<br>l2 |'].join('\n'));
});

test('md: serializer rejects non-tabular input', () => {
  assertThrows(() => SERIALIZERS.md({ a: 1 }), /array/);
  assertThrows(() => SERIALIZERS.md(['x']), /no fields/);
});

test('md: round-trips records including special characters', () => {
  const records = [
    { id: 1, name: 'Ada | Lovelace', note: 'line1\nline2' },
    { id: 2, name: 'Grace', note: 'ünïcödé ✓' },
  ];
  assertEq(PARSERS.md(SERIALIZERS.md(records)), records);
});

test('md: coerceTypes:false keeps cell text verbatim', () => {
  const input = '| id | ok |\n|---|---|\n| 007 | true |';
  assertEq(PARSERS.md(input, { coerceTypes: false }), [{ id: '007', ok: 'true' }]);
});

test('md → json and json → md cross-format conversions', () => {
  const json = convert('| a |\n|---|\n| 1 |', 'md', 'json');
  assertEq(PARSERS.json(json), [{ a: 1 }]);

  const md = convert('[{"a": 1, "b": "x"}]', 'json', 'md');
  assertEq(md, ['| a | b |', '|---|---|', '| 1 | x |'].join('\n'));
});

test('md strict: ragged table row throws with the row number', () => {
  const input = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |';
  assertThrows(() => PARSERS.md(input, { strictParse: true }), /table row 4 has 1 cell, expected 2/);
});

test('md lenient default: ragged rows are backfilled', () => {
  const input = '| a | b |\n|---|---|\n| 3 |';
  assertEq(PARSERS.md(input), [{ a: 3, b: '' }]);
});
