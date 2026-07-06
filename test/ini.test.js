'use strict';

const { test, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('ini: parses global keys, sections, and dotted sections', () => {
  const input = [
    'name = Tooly',
    'version = 1.5',
    '',
    '[server]',
    'host = localhost',
    'port = 8080',
    '',
    '[server.tls]',
    'enabled = true',
  ].join('\n');
  assertEq(PARSERS.ini(input), {
    name: 'Tooly',
    version: 1.5,
    server: { host: 'localhost', port: 8080, tls: { enabled: true } },
  });
});

test('ini: full-line comments and blank lines are ignored', () => {
  const input = [
    '; semicolon comment',
    '# hash comment',
    '',
    'url = https://example.com/#anchor;x',
  ].join('\n');
  assertEq(PARSERS.ini(input), { url: 'https://example.com/#anchor;x' });
});

test('ini: values coerce like csv and respect coerceTypes:false', () => {
  assertEq(PARSERS.ini('a = 007\nb = true'), { a: 7, b: true });
  assertEq(PARSERS.ini('a = 007\nb = true', { coerceTypes: false }), { a: '007', b: 'true' });
});

test('ini: quoted values preserve spaces, quotes, escapes, and ambiguous scalars', () => {
  const input = 'a = "007"\nb = " padded "\nc = "line1\\nline2"\nd = "say \\"hi\\""';
  assertEq(PARSERS.ini(input), {
    a: '007',
    b: ' padded ',
    c: 'line1\nline2',
    d: 'say "hi"',
  });
});

test('ini: re-entering a section merges; duplicate keys throw', () => {
  const merged = PARSERS.ini('[a]\nx = 1\n[b]\ny = 2\n[a]\nz = 3');
  assertEq(merged, { a: { x: 1, z: 3 }, b: { y: 2 } });
  assertThrows(() => PARSERS.ini('a = 1\na = 2'), /INI line 2: duplicate key/);
  assertThrows(() => PARSERS.ini('a = 1\n[a]\nx = 1'), /conflicts with an existing non-section value/);
});

test('ini: malformed lines throw with the line number', () => {
  assertThrows(() => PARSERS.ini('a = 1\njust words'), /INI line 2: expected/);
  assertThrows(() => PARSERS.ini('[]'), /INI line 1: empty section header/);
});

test('ini: round-trips a nested config through dotted sections', () => {
  const value = {
    title: 'Format Flipper',
    debug: false,
    server: {
      host: 'localhost',
      port: 8080,
      tls: { enabled: true, cert: '/etc/ssl/cert pem file' },
    },
  };
  assertEq(PARSERS.ini(SERIALIZERS.ini(value)), value);
});

test('ini: ambiguous strings survive a round-trip via quoting', () => {
  const value = { a: '007', b: 'true', c: '', d: ' padded ', e: 'multi\nline' };
  assertEq(PARSERS.ini(SERIALIZERS.ini(value)), value);
});

test('ini: arrays serialize as JSON strings (documented lossiness)', () => {
  const out = SERIALIZERS.ini({ tools: ['json', 'yaml'], nums: [1, 2] });
  assertEq(out, 'tools = "[\\"json\\",\\"yaml\\"]"\nnums = [1,2]');
  assertEq(PARSERS.ini(out), { tools: '["json","yaml"]', nums: '[1,2]' });
});

test('ini: serializer rejects top-level arrays and scalars with guidance', () => {
  assertThrows(() => SERIALIZERS.ini([1, 2]), /top-level object/);
  assertThrows(() => SERIALIZERS.ini('scalar'), /top-level object/);
});

test('ini ↔ json cross-format conversions', () => {
  const json = convert('[owner]\nname = Tooly', 'ini', 'json');
  assertEq(PARSERS.json(json), { owner: { name: 'Tooly' } });

  const ini = convert('{"a": 1, "s": {"b": "x"}}', 'json', 'ini');
  assertEq(PARSERS.ini(ini), { a: 1, s: { b: 'x' } });
});
