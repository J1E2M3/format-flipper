'use strict';

const { test, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('properties: parses =, :, and whitespace separators with comments', () => {
  const input = [
    '# hash comment',
    '! bang comment',
    '',
    'a = 1',
    'b: two',
    'c three',
    'bare',
  ].join('\n');
  assertEq(PARSERS.properties(input), { a: 1, b: 'two', c: 'three', bare: '' });
});

test('properties: keys stay flat — dots are not split', () => {
  assertEq(PARSERS.properties('log4j.appender.stdout = console'), {
    'log4j.appender.stdout': 'console',
  });
});

test('properties: backslash line continuations join logical lines', () => {
  const input = 'fruits = apple, \\\n         banana, \\\n         cherry';
  assertEq(PARSERS.properties(input), { fruits: 'apple, banana, cherry' });
});

test('properties: decodes escapes in keys and values', () => {
  const input = 'path\\ with\\ spaces = C\\:\\\\temp\ntext = line1\\nline2\\tend\nuni = \\u00e9';
  assertEq(PARSERS.properties(input), {
    'path with spaces': 'C:\\temp',
    text: 'line1\nline2\tend',
    uni: 'é',
  });
});

test('properties: values coerce like csv and respect coerceTypes:false', () => {
  assertEq(PARSERS.properties('a = 007\nb = true'), { a: 7, b: true });
  assertEq(PARSERS.properties('a = 007\nb = true', { coerceTypes: false }), { a: '007', b: 'true' });
});

test('properties: duplicate and empty keys throw with the line number', () => {
  assertThrows(() => PARSERS.properties('a = 1\na = 2'), /Properties line 2: duplicate key/);
  assertThrows(() => PARSERS.properties('= 1'), /Properties line 1: empty key/);
});

test('properties: serializes a flat object with escaping', () => {
  const out = SERIALIZERS.properties({ 'key with space': 'a\nb', port: 8080, on: true, gone: null });
  assertEq(out, 'key\\ with\\ space = a\\nb\nport = 8080\non = true\ngone = ');
});

test('properties: nested objects flatten into dotted keys (one-way)', () => {
  const out = SERIALIZERS.properties({ server: { host: 'localhost', tls: { on: true } } });
  assertEq(out, 'server.host = localhost\nserver.tls.on = true');
  assertEq(PARSERS.properties(out), { 'server.host': 'localhost', 'server.tls.on': true });
});

test('properties: arrays serialize as JSON strings (documented lossiness)', () => {
  const out = SERIALIZERS.properties({ tools: [1, 2] });
  assertEq(out, 'tools = [1,2]');
});

test('properties: serializer rejects non-object input with guidance', () => {
  assertThrows(() => SERIALIZERS.properties([1, 2]), /top-level object/);
  assertThrows(() => SERIALIZERS.properties('scalar'), /top-level object/);
});

test('properties: round-trips a flat config', () => {
  const value = { host: 'localhost', port: 8080, debug: false, motd: 'hello\nworld' };
  assertEq(PARSERS.properties(SERIALIZERS.properties(value)), value);
});

test('properties ↔ json cross-format conversions', () => {
  const json = convert('a = 1\nb = x', 'properties', 'json');
  assertEq(PARSERS.json(json), { a: 1, b: 'x' });

  const props = convert('{"a": 1, "s": {"b": "x"}}', 'json', 'properties');
  assertEq(props, 'a = 1\ns.b = x');
});
