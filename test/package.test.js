'use strict';

// The npm package under packages/format-flipper is generated from
// index.html. These tests keep the generated copies current and prove
// the package factory produces a working engine — without requiring
// the package's npm dependencies to be installed in this repo.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test, assert, assertEq } = require('./runner');

const ROOT = path.join(__dirname, '..');

test('package: generated files are current (tools/build-package.js --check)', () => {
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-package.js'), '--check']);
  } catch (e) {
    assert(false, 'stale package files — run: node tools/build-package.js');
  }
});

test('package: engine factory instantiates and converts', () => {
  const createEngine = require(path.join(ROOT, 'packages', 'format-flipper', 'engine.js'));
  const { DOMParser } = require('./dom-shim');
  // globalThis.jsyaml is initialized by the harness's js-yaml extraction.
  require('./harness');
  const { PARSERS, SERIALIZERS } = createEngine({ jsyaml: globalThis.jsyaml }, DOMParser);
  assertEq(Object.keys(PARSERS).length, 12);
  assertEq(PARSERS.csv('a,b\n1,2'), [{ a: 1, b: 2 }]);
  assertEq(SERIALIZERS.json({ x: 1 }, { jsonIndent: 0 }), '{"x":1}');
  const yaml = SERIALIZERS.yaml({ name: 'Tooly' }, { yamlIndent: 2 });
  assert(yaml.includes('name: Tooly'), 'yaml serializer through package engine');
});
