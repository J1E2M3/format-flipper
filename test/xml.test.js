'use strict';

const { test, assert, assertEq, assertThrows } = require('./runner');
const { PARSERS, SERIALIZERS, convert } = require('./harness');

test('xml: serializes an array of records under root/item tags', () => {
  const out = SERIALIZERS.xml([{ id: 1, name: 'Ada' }], {});
  assert(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'expected XML declaration');
  assert(out.includes('<rows>') && out.includes('<row>'), 'expected default rows/row tags');
  assert(out.includes('<id>1</id>') && out.includes('<name>Ada</name>'), 'expected field elements');
});

test('xml: honors custom root and item tag options', () => {
  const out = SERIALIZERS.xml([{ id: 1 }], { xmlRoot: 'people', xmlItem: 'person' });
  assert(out.includes('<people>') && out.includes('<person>'), 'expected custom tags, got ' + out);
});

test('xml: parses repeated same-tag children as an array of records', () => {
  const input = '<rows><row><id>1</id><name>Ada</name></row><row><id>2</id><name>Grace</name></row></rows>';
  assertEq(PARSERS.xml(input), [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
  ]);
});

test('xml: parses a single-object document with type coercion', () => {
  const input = '<config><debug>true</debug><port>8080</port><ratio>0.5</ratio><name>Tooly</name><gone>null</gone></config>';
  assertEq(PARSERS.xml(input), { debug: true, port: 8080, ratio: 0.5, name: 'Tooly', gone: null });
});

test('xml: round-trips an array of records', () => {
  const records = [
    { id: 1, name: 'Ada Lovelace', active: true },
    { id: 2, name: 'Grace Hopper', active: false },
  ];
  assertEq(PARSERS.xml(SERIALIZERS.xml(records, {})), records);
});

test('xml: special characters are escaped and restored', () => {
  const records = [{ text: 'a < b & c > "d" \'e\'' }];
  const out = SERIALIZERS.xml(records, {});
  assert(out.includes('&lt;') && out.includes('&amp;') && out.includes('&quot;'), 'expected escaped entities in ' + JSON.stringify(out));
  assertEq(PARSERS.xml(out), records);
});

test('xml: nested objects and arrays round-trip', () => {
  const value = {
    owner: { name: 'Tooly', langs: ['js', 'html'] },
    active: true,
  };
  const out = SERIALIZERS.xml(value, { xmlRoot: 'config' });
  assertEq(PARSERS.xml(out), { owner: { name: 'Tooly', langs: ['js', 'html'] }, active: true });
});

test('xml: attributes become @-prefixed keys with type coercion', () => {
  assertEq(PARSERS.xml('<user id="7" admin="true"><name>Ada</name></user>'), {
    '@id': 7,
    '@admin': true,
    name: 'Ada',
  });
});

test('xml: attributes on a text-bearing element use #text for the content', () => {
  assertEq(PARSERS.xml('<price currency="USD">19.99</price>'), {
    '@currency': 'USD',
    '#text': 19.99,
  });
});

test('xml: @-keys and #text serialize back to attributes and round-trip', () => {
  const value = {
    '@id': 7,
    '@active': true,
    name: 'Ada',
    price: { '@currency': 'USD', '#text': 19.99 },
  };
  const out = SERIALIZERS.xml(value, { xmlRoot: 'user' });
  assert(out.includes('<user id="7" active="true">'), 'expected root attributes, got ' + JSON.stringify(out));
  assert(out.includes('<price currency="USD">19.99</price>'), 'expected attribute + text element, got ' + JSON.stringify(out));
  assertEq(PARSERS.xml(out), value);
});

test('xml: attribute values are escaped and restored', () => {
  const value = { '@label': 'a "b" & <c>', '#text': 'body' };
  const out = SERIALIZERS.xml(value, { xmlRoot: 'node' });
  assert(out.includes('label="a &quot;b&quot; &amp; &lt;c&gt;"'), 'expected escaped attribute, got ' + JSON.stringify(out));
  assertEq(PARSERS.xml(out), value);
});

test('xml: invalid markup throws a parse error', () => {
  assertThrows(() => PARSERS.xml('<a><b></a>'), /Invalid XML/);
  assertThrows(() => PARSERS.xml('not xml at all'), /Invalid XML/);
});

test('xml → csv cross-format conversion', () => {
  const csv = convert('<rows><row><id>1</id><name>Ada</name></row><row><id>2</id><name>Grace</name></row></rows>', 'xml', 'csv');
  assertEq(csv, 'id,name\n1,Ada\n2,Grace');
});
