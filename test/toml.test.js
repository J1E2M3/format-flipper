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

test('toml ↔ json cross-format conversions', () => {
  const json = convert('name = "Tooly"\ntools = ["json", "yaml"]', 'toml', 'json');
  assertEq(PARSERS.json(json), { name: 'Tooly', tools: ['json', 'yaml'] });

  const toml = convert('{"owner": {"name": "Tooly", "active": true}}', 'json', 'toml');
  assertEq(PARSERS.toml(toml), { owner: { name: 'Tooly', active: true } });
});
