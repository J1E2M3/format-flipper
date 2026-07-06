'use strict';

const { test, assert, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('html: parses a table with thead/tbody', () => {
  const input = [
    '<table>',
    '  <thead><tr><th>id</th><th>name</th></tr></thead>',
    '  <tbody>',
    '    <tr><td>1</td><td>Ada</td></tr>',
    '    <tr><td>2</td><td>Grace</td></tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
  assertEq(PARSERS.html(input), [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
  ]);
});

test('html: parses a bare table without thead and decodes entities', () => {
  const input = '<table><tr><th>text</th></tr><tr><td>a &amp; b &lt;c&gt;</td></tr></table>';
  assertEq(PARSERS.html(input), [{ text: 'a & b <c>' }]);
});

test('html: throws when no table is present', () => {
  assertThrows(() => PARSERS.html('<p>no tables here</p>'), /No <table>/);
});

test('html: serializer emits a thead/tbody table with escaped cells', () => {
  const out = SERIALIZERS.html([{ text: 'a < b & "c"' }]);
  assert(out.startsWith('<table>'), 'expected a <table>, got ' + JSON.stringify(out));
  assert(out.includes('<th>text</th>'), 'expected a header cell');
  assert(out.includes('a &lt; b &amp; "c"'), 'expected escaped cell content, got ' + JSON.stringify(out));
});

test('html: serializer rejects non-tabular input', () => {
  assertThrows(() => SERIALIZERS.html({ a: 1 }), /array/);
});

test('html: round-trips records', () => {
  const records = [
    { id: 1, name: 'Ada Lovelace', active: true, score: 9.5 },
    { id: 2, name: 'Grace & "Hopper" <RA>', active: false, score: 8.75 },
  ];
  assertEq(PARSERS.html(SERIALIZERS.html(records)), records);
});

test('html: coerceTypes:false keeps cell text verbatim', () => {
  const input = '<table><tr><th>id</th><th>ok</th></tr><tr><td>007</td><td>true</td></tr></table>';
  assertEq(PARSERS.html(input, { coerceTypes: false }), [{ id: '007', ok: 'true' }]);
});

test('html → csv cross-format conversion', () => {
  const csv = convert('<table><tr><th>a</th></tr><tr><td>1</td></tr></table>', 'html', 'csv');
  assertEq(csv, 'a\n1');
});
