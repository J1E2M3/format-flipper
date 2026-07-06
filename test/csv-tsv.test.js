'use strict';

const { test, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

const RECORDS = [
  { id: 1, name: 'Ada Lovelace', active: true, score: 9.5 },
  { id: 2, name: 'Grace Hopper', active: false, score: 8.75 },
];

test('csv: parses header + rows with type coercion', () => {
  const input = 'id,name,active,score\n1,Ada Lovelace,true,9.5\n2,Grace Hopper,false,8.75';
  assertEq(PARSERS.csv(input), RECORDS);
});

test('csv: handles quoted fields with commas, quotes, and newlines', () => {
  const input = 'name,quote\n"Hopper, Grace","She said ""hi""\nand left"';
  assertEq(PARSERS.csv(input), [
    { name: 'Hopper, Grace', quote: 'She said "hi"\nand left' },
  ]);
});

test('csv: handles CRLF line endings', () => {
  const input = 'a,b\r\n1,2\r\n3,4\r\n';
  assertEq(PARSERS.csv(input), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
});

test('csv: missing cells become empty strings', () => {
  const input = 'a,b,c\n1,2';
  assertEq(PARSERS.csv(input), [{ a: 1, b: 2, c: '' }]);
});

test('csv: empty input parses to an empty array', () => {
  assertEq(PARSERS.csv(''), []);
  assertEq(PARSERS.csv('a,b'), []); // header only
});

test('csv: serializer quotes only when needed', () => {
  const out = SERIALIZERS.csv([
    { plain: 'x', tricky: 'a,b', quoted: 'say "hi"', multi: 'l1\nl2' },
  ]);
  assertEq(out, 'plain,tricky,quoted,multi\nx,"a,b","say ""hi""","l1\nl2"');
});

test('csv: null and undefined serialize as empty cells', () => {
  assertEq(SERIALIZERS.csv([{ a: null, b: 1 }]), 'a,b\n,1');
});

test('csv: nested objects in cells are JSON-stringified', () => {
  const out = SERIALIZERS.csv([{ a: { x: 1 } }]);
  assertEq(out, 'a\n"{""x"":1}"');
});

test('csv: serializer rejects non-tabular input', () => {
  assertThrows(() => SERIALIZERS.csv({ a: 1 }), /array of records/);
  assertThrows(() => SERIALIZERS.csv([1, 2, 3]), /no fields/);
});

test('csv: empty array serializes to an empty string', () => {
  assertEq(SERIALIZERS.csv([]), '');
});

test('csv: round-trips records including unicode', () => {
  const records = [
    { id: 1, name: 'héllo wörld', note: 'a,b "c"\nd' },
    { id: 2, name: '日本語 🎉', note: 'plain' },
  ];
  assertEq(PARSERS.csv(SERIALIZERS.csv(records)), records);
});

test('tsv: uses tab as the delimiter', () => {
  assertEq(PARSERS.tsv('a\tb\n1\tx y'), [{ a: 1, b: 'x y' }]);
  assertEq(SERIALIZERS.tsv([{ a: 1, b: 'x y' }]), 'a\tb\n1\tx y');
});

test('tsv: quotes fields containing tabs', () => {
  const records = [{ a: 'has\ttab', b: 2 }];
  assertEq(PARSERS.tsv(SERIALIZERS.tsv(records)), records);
});

test('csv/tsv: coerceTypes:false keeps every cell a verbatim string', () => {
  assertEq(PARSERS.csv('id,active,score\n007,true,9.50', { coerceTypes: false }), [
    { id: '007', active: 'true', score: '9.50' },
  ]);
  assertEq(PARSERS.tsv('a\tb\n1\tfalse', { coerceTypes: false }), [{ a: '1', b: 'false' }]);
});

test('csv: parses semicolon-delimited input via csvDelimiterIn', () => {
  assertEq(PARSERS.csv('a;b\n1;x', { csvDelimiterIn: 'semicolon' }), [{ a: 1, b: 'x' }]);
});

test('csv: serializes with pipe delimiter and quotes fields containing it', () => {
  assertEq(SERIALIZERS.csv([{ a: 1, b: 'x|y' }], { csvDelimiterOut: 'pipe' }), 'a|b\n1|"x|y"');
});

test('csv: unknown delimiter token falls back to comma', () => {
  assertEq(SERIALIZERS.csv([{ a: 1, b: 2 }], { csvDelimiterOut: 'nonsense' }), 'a,b\n1,2');
  assertEq(PARSERS.csv('a,b\n1,2', { csvDelimiterIn: 'nonsense' }), [{ a: 1, b: 2 }]);
});

test('csv: defaults unchanged when opts omitted', () => {
  assertEq(SERIALIZERS.csv([{ a: 1, b: 2 }]), 'a,b\n1,2');
  assertEq(PARSERS.csv('a,b\n1,2'), [{ a: 1, b: 2 }]);
});

test('tsv: ignores csv delimiter options', () => {
  assertEq(SERIALIZERS.tsv([{ a: 1, b: 2 }], { csvDelimiterOut: 'pipe' }), 'a\tb\n1\t2');
  assertEq(PARSERS.tsv('a\tb\n1\t2', { csvDelimiterIn: 'pipe' }), [{ a: 1, b: 2 }]);
});

test('csv: round-trips semicolon csv through convert()', () => {
  const out = convert('a;b\n1;2', 'csv', 'csv', { csvDelimiterIn: 'semicolon', csvDelimiterOut: 'semicolon' });
  assertEq(out, 'a;b\n1;2');
});

test('csv → json and json → csv cross-format conversions', () => {
  const json = convert('id,name\n1,Ada', 'csv', 'json');
  assertEq(PARSERS.json(json), [{ id: 1, name: 'Ada' }]);

  const csv = convert('[{"id": 1, "name": "Ada"}]', 'json', 'csv');
  assertEq(csv, 'id,name\n1,Ada');
});

test('csv strict: unterminated quote throws', () => {
  assertThrows(
    () => PARSERS.csv('a,b\n"unterminated,x', { strictParse: true }),
    /unterminated quoted field/
  );
});

test('csv strict: ragged row throws with the row number', () => {
  assertThrows(
    () => PARSERS.csv('a,b\n1,2\n3', { strictParse: true }),
    /row 3 has 1 field, expected 2/
  );
});

test('csv lenient default: same malformed inputs are absorbed', () => {
  assertEq(PARSERS.csv('a,b\n"unterminated,x'), [{ a: 'unterminated,x', b: '' }]);
  assertEq(PARSERS.csv('a,b\n1,2\n3'), [{ a: 1, b: 2 }, { a: 3, b: '' }]);
});

test('tsv strict: ragged row throws', () => {
  assertThrows(
    () => PARSERS.tsv('a\tb\n1\t2\t3', { strictParse: true }),
    /row 2 has 3 fields, expected 2/
  );
});
