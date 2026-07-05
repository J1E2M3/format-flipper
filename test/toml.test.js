'use strict';

const { test, assert, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('toml: parses scalars, strings, and numbers', () => {
  const input = [
    'title = "Format Flipper"',
    "literal = 'no \\escapes here'",
    'escaped = "line1\\nline2\\t\\"quoted\\""',
    'count = 1_000_000',
    'ratio = 3.14',
    'negative = -17',
    'exponent = 5e3',
    'enabled = true',
    'disabled = false',
  ].join('\n');
  assertEq(PARSERS.toml(input), {
    title: 'Format Flipper',
    literal: 'no \\escapes here',
    escaped: 'line1\nline2\t"quoted"',
    count: 1000000,
    ratio: 3.14,
    negative: -17,
    exponent: 5000,
    enabled: true,
    disabled: false,
  });
});

test('toml: parses arrays and inline tables', () => {
  const input = [
    'tools = ["compress", "json", "regex"]',
    'mixed = [1, 2.5, true, "x"]',
    'nested = [[1, 2], [3, 4]]',
    'point = { x = 1, y = 2, label = "origin" }',
  ].join('\n');
  assertEq(PARSERS.toml(input), {
    tools: ['compress', 'json', 'regex'],
    mixed: [1, 2.5, true, 'x'],
    nested: [[1, 2], [3, 4]],
    point: { x: 1, y: 2, label: 'origin' },
  });
});

test('toml: parses sections, dotted paths, and arrays of tables', () => {
  const input = [
    '[owner]',
    'name = "Tooly"',
    '',
    '[servers.alpha]',
    'ip = "10.0.0.1"',
    '',
    '[servers.beta]',
    'ip = "10.0.0.2"',
    '',
    '[[fruits]]',
    'name = "apple"',
    '',
    '[[fruits]]',
    'name = "banana"',
  ].join('\n');
  assertEq(PARSERS.toml(input), {
    owner: { name: 'Tooly' },
    servers: { alpha: { ip: '10.0.0.1' }, beta: { ip: '10.0.0.2' } },
    fruits: [{ name: 'apple' }, { name: 'banana' }],
  });
});

test('toml: comments are stripped, but # inside strings survives', () => {
  const input = [
    '# full-line comment',
    'a = 1 # trailing comment',
    'b = "value # not a comment"',
  ].join('\n');
  assertEq(PARSERS.toml(input), { a: 1, b: 'value # not a comment' });
});

test('toml: parses offset datetimes as Date values', () => {
  const parsed = PARSERS.toml('ts = 2024-10-08T14:11:35Z');
  assert(parsed.ts instanceof Date, 'expected a Date instance');
  assertEq(parsed.ts.toISOString(), '2024-10-08T14:11:35.000Z');
});

test('toml: rejects malformed input with helpful errors', () => {
  assertThrows(() => PARSERS.toml('just some words'), /TOML line 1/);
  assertThrows(() => PARSERS.toml('a = 1\na = 2'), /duplicate key/);
  assertThrows(() => PARSERS.toml('bad key = 1'), /invalid bare key/);
  assertThrows(() => PARSERS.toml('a = @nope'), /unrecognized value/);
});

test('toml: round-trips a complex config', () => {
  const value = {
    title: 'Example — with unicode ✓',
    database: {
      ports: [8001, 8002],
      enabled: true,
      ratio: 0.5,
      'quoted key': 'needs quoting',
    },
    servers: [
      { name: 'alpha', ip: '10.0.0.1' },
      { name: 'beta', ip: '10.0.0.2' },
    ],
  };
  const toml = SERIALIZERS.toml(value, {});
  assertEq(PARSERS.toml(toml), value);
});

test('toml: dates survive a round-trip as Date values', () => {
  const value = { created: new Date('2024-10-08T14:11:35.000Z') };
  assertEq(PARSERS.toml(SERIALIZERS.toml(value, {})), value);
});

test('toml: serializer rejects a top-level array with guidance', () => {
  assertThrows(() => SERIALIZERS.toml([1, 2, 3], {}), /top-level object/);
});

test('toml: multi-line basic strings trim the leading newline and decode escapes', () => {
  const input = 'a = """\nline1\nline2 with \\"quote\\" and \\t tab"""';
  assertEq(PARSERS.toml(input), { a: 'line1\nline2 with "quote" and \t tab' });
});

test('toml: multi-line basic strings support backslash line continuation', () => {
  const input = 'a = """\\\n\n   joined"""';
  assertEq(PARSERS.toml(input), { a: 'joined' });
});

test('toml: multi-line literal strings are taken verbatim (no escapes)', () => {
  const input = "p = '''\nC:\\Users\\nate\nline2'''";
  assertEq(PARSERS.toml(input), { p: 'C:\\Users\\nate\nline2' });
});

test('toml: quotes and comment marks inside multi-line strings do not confuse parsing', () => {
  const input = [
    'a = """has "quote" and # hash',
    'second""" # trailing comment',
    'b = 2',
  ].join('\n');
  assertEq(PARSERS.toml(input), { a: 'has "quote" and # hash\nsecond', b: 2 });
});

test('toml: multi-line strings work inside arrays', () => {
  assertEq(PARSERS.toml('a = ["""x\ny""", 2]'), { a: ['x\ny', 2] });
});

test('toml: multi-line values round-trip through the serializer', () => {
  const value = { s: 'a\nb"c', t: 'tab\there' };
  assertEq(PARSERS.toml(SERIALIZERS.toml(value, {})), value);
});

test('toml: unterminated multi-line string reports its opening line', () => {
  assertThrows(() => PARSERS.toml('x = 1\ny = """\nnever closed'), /TOML line 2: unterminated multi-line string/);
});

test('toml: line numbers stay accurate after a multi-line string', () => {
  const input = ['a = """', 'l1', 'l2"""', 'bad line'].join('\n');
  assertThrows(() => PARSERS.toml(input), /TOML line 4/);
});

test('toml: parses hex, octal, and binary integers with underscores', () => {
  assertEq(PARSERS.toml('h = 0xDEADBEEF\no = 0o755\nb = 0b1101\nhu = 0xdead_beef'), {
    h: 3735928559,
    o: 493,
    b: 13,
    hu: 3735928559,
  });
});

test('toml: rejects malformed radix literals', () => {
  assertThrows(() => PARSERS.toml('x = 0xGG'), /unrecognized value/);
  assertThrows(() => PARSERS.toml('x = 0o9'), /unrecognized value/);
  assertThrows(() => PARSERS.toml('x = 0b2'), /unrecognized value/);
});

test('toml: inline dotted keys build nested tables', () => {
  assertEq(PARSERS.toml('a.b.c = 1\na.b.d = 2\na.e = 3'), {
    a: { b: { c: 1, d: 2 }, e: 3 },
  });
});

test('toml: dotted keys work inside sections', () => {
  assertEq(PARSERS.toml('[s]\nx.y = 1\nx.z = "w"'), { s: { x: { y: 1, z: 'w' } } });
});

test('toml: quoted key segments keep their dots', () => {
  assertEq(PARSERS.toml('"a.b".c = 1'), { 'a.b': { c: 1 } });
});

test('toml: dotted key conflicts and duplicates throw', () => {
  assertThrows(() => PARSERS.toml('a = 1\na.b = 2'), /not a table/);
  assertThrows(() => PARSERS.toml('a.b = 1\na.b = 2'), /duplicate key/);
});

test('toml ↔ json cross-format conversions', () => {
  const json = convert('name = "Tooly"\ntools = ["json", "yaml"]', 'toml', 'json');
  assertEq(PARSERS.json(json), { name: 'Tooly', tools: ['json', 'yaml'] });

  const toml = convert('{"owner": {"name": "Tooly", "active": true}}', 'json', 'toml');
  assertEq(PARSERS.toml(toml), { owner: { name: 'Tooly', active: true } });
});
