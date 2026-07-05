'use strict';

const { test, assert, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('sql: parses a multi-row INSERT with mixed types', () => {
  const input = [
    "INSERT INTO users (id, name, active, score) VALUES",
    "  (1, 'Ada', TRUE, 9.5),",
    "  (2, 'Grace', FALSE, 8.75),",
    "  (3, NULL, true, -2);",
  ].join('\n');
  assertEq(PARSERS.sql(input), [
    { id: 1, name: 'Ada', active: true, score: 9.5 },
    { id: 2, name: 'Grace', active: false, score: 8.75 },
    { id: 3, name: null, active: true, score: -2 },
  ]);
});

test('sql: handles backtick-quoted identifiers', () => {
  const input = 'INSERT INTO `t` (`a`, `b`) VALUES (1, 2);';
  assertEq(PARSERS.sql(input), [{ a: 1, b: 2 }]);
});

test('sql: unescapes doubled and backslash-escaped quotes', () => {
  const input = "INSERT INTO t (a, b) VALUES ('O''Brien', 'It\\'s fine');";
  assertEq(PARSERS.sql(input), [{ a: "O'Brien", b: "It's fine" }]);
});

test('sql: values containing commas and parens stay intact', () => {
  const input = "INSERT INTO t (a, b) VALUES ('x, (y), z', 'plain');";
  assertEq(PARSERS.sql(input), [{ a: 'x, (y), z', b: 'plain' }]);
});

test('sql: ignores a leading CREATE TABLE statement', () => {
  const input = [
    'CREATE TABLE `t` (',
    '  `a` INTEGER,',
    '  `b` TEXT',
    ');',
    '',
    "INSERT INTO `t` (`a`, `b`) VALUES",
    "  (1, 'x');",
  ].join('\n');
  assertEq(PARSERS.sql(input), [{ a: 1, b: 'x' }]);
});

test('sql: throws a helpful error when no INSERT is found', () => {
  assertThrows(() => PARSERS.sql('SELECT * FROM t;'), /INSERT INTO/);
});

test('sql: serializer emits CREATE TABLE with inferred types plus INSERT', () => {
  const out = SERIALIZERS.sql(
    [
      { id: 1, name: 'Ada', active: true, score: 9.5, note: null },
      { id: 2, name: 'Grace', active: false, score: 8, note: 'x' },
    ],
    { sqlTable: 'people' }
  );
  assert(out.startsWith('CREATE TABLE `people` ('), 'expected CREATE TABLE, got ' + JSON.stringify(out));
  assert(out.includes('`id` INTEGER'), 'id should be INTEGER');
  assert(out.includes('`name` TEXT'), 'name should be TEXT');
  assert(out.includes('`active` BOOLEAN'), 'active should be BOOLEAN');
  assert(out.includes('`score` REAL'), 'mixed int/float column should widen to REAL');
  assert(out.includes('`note` TEXT'), 'all-null-then-text column should be TEXT');
  assert(out.includes('INSERT INTO `people` (`id`, `name`, `active`, `score`, `note`) VALUES'), 'expected INSERT statement');
  assert(out.trimEnd().endsWith(';'), 'INSERT should end with a semicolon');
});

test('sql: serializer escapes single quotes and writes NULL', () => {
  const out = SERIALIZERS.sql([{ name: "O'Brien", note: null }], {});
  assert(out.includes("('O''Brien', NULL);"), 'expected escaped quote and NULL, got ' + JSON.stringify(out));
});

test('sql: table name is sanitized', () => {
  const out = SERIALIZERS.sql([{ a: 1 }], { sqlTable: 'my table; DROP--' });
  assert(out.includes('INSERT INTO `mytableDROP--`'.replace('--', '')), 'expected sanitized table name, got ' + JSON.stringify(out));
});

test('sql: serializer rejects non-tabular input', () => {
  assertThrows(() => SERIALIZERS.sql({ a: 1 }, {}), /array/);
});

test('sql: round-trips records through CREATE TABLE + INSERT', () => {
  const records = [
    { id: 1, name: "Ada 'the first' Lovelace", active: true, score: 9.5 },
    { id: 2, name: 'Grace Hopper', active: false, score: 8.75 },
  ];
  assertEq(PARSERS.sql(SERIALIZERS.sql(records, {})), records);
});

test('sql: coerceTypes:false leaves bare tokens as strings but NULL and quotes still apply', () => {
  const input = "INSERT INTO t (a, b, c, d) VALUES (007, 'O''Brien', NULL, true);";
  assertEq(PARSERS.sql(input, { coerceTypes: false }), [
    { a: '007', b: "O'Brien", c: null, d: 'true' },
  ]);
});

test('sql → csv and json → sql cross-format conversions', () => {
  const csv = convert("INSERT INTO t (a, b) VALUES (1, 'x');", 'sql', 'csv');
  assertEq(csv, 'a,b\n1,x');

  const sql = convert('[{"a": 1}]', 'json', 'sql');
  assertEq(PARSERS.sql(sql), [{ a: 1 }]);
});
