'use strict';

// Generate packages/format-flipper from index.html.
//
//   node tools/build-package.js          # regenerate the package's derived files
//   node tools/build-package.js --check  # exit 1 if they are stale (used by tests)
//
// index.html stays the single source of truth for the engine — the same
// marker extraction the test harness uses produces the npm package, so
// the published code is byte-identical to what the browser tool ships.
// Derived files carry a DO-NOT-EDIT header and are committed so the
// package is inspectable in-repo; this tool plus test/package.test.js
// keep them honest.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'packages', 'format-flipper');

function section(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`could not find the start of ${label} in index.html`);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error(`could not find the end of ${label} in index.html`);
  return src.slice(start, end);
}

function generated() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const engineSrc = section(
    html,
    '// PARSERS — format text',
    'const FORMAT_LABELS',
    'the conversion engine'
  );

  const engine = [
    "'use strict';",
    '',
    '// GENERATED from index.html by tools/build-package.js — DO NOT EDIT.',
    '// The browser tool is the source of truth; this file is byte-identical',
    '// engine code, wrapped as a factory so the host supplies the two',
    '// browser APIs the engine touches (window.jsyaml and DOMParser).',
    '',
    'module.exports = function createEngine(window, DOMParser) {',
    engineSrc,
    'return { PARSERS, SERIALIZERS };',
    '};',
    '',
  ].join('\n');

  const shimSrc = fs.readFileSync(path.join(ROOT, 'test', 'dom-shim.js'), 'utf8');
  const shim = shimSrc.replace(
    "'use strict';\n",
    "'use strict';\n\n// GENERATED copy of test/dom-shim.js by tools/build-package.js — DO NOT EDIT.\n"
  );

  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');

  return {
    'engine.js': engine,
    'dom-shim.js': shim,
    'LICENSE': license,
  };
}

const files = generated();
const check = process.argv.includes('--check');
let stale = false;

for (const [name, content] of Object.entries(files)) {
  const target = path.join(PKG, name);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) continue;
  if (check) {
    console.error(`packages/format-flipper/${name} is stale`);
    stale = true;
  } else {
    fs.mkdirSync(PKG, { recursive: true });
    fs.writeFileSync(target, content);
    console.log(`wrote packages/format-flipper/${name}`);
  }
}

if (check) {
  if (stale) {
    console.error('run: node tools/build-package.js');
    process.exit(1);
  }
  console.log('packages/format-flipper derived files are current');
} else if (!Object.keys(files).some(n => true)) {
  // unreachable; keeps structure obvious
} else {
  console.log('package build complete');
}
