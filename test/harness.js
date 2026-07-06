'use strict';

// Loads the conversion engine straight out of index.html so tests always
// exercise the exact code that ships. The engine only touches two browser
// APIs — window.jsyaml and DOMParser — which are supplied here.

const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('./dom-shim');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');

function section(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`could not find the start of ${label} in index.html`);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error(`could not find the end of ${label} in index.html`);
  return src.slice(start, end);
}

function loadEngine() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  // The js-yaml UMD bundle attaches itself to globalThis.jsyaml.
  const yamlSrc = section(html, '/*! js-yaml', '</script>', 'the js-yaml bundle');
  new Function(yamlSrc)();
  if (!globalThis.jsyaml) throw new Error('js-yaml bundle did not initialize');

  const engineSrc = section(
    html,
    '// PARSERS — format text',
    'const FORMAT_LABELS',
    'the conversion engine'
  );
  const factory = new Function(
    'window',
    'DOMParser',
    "'use strict';\n" + engineSrc + '\nreturn { PARSERS, SERIALIZERS };'
  );
  return factory({ jsyaml: globalThis.jsyaml }, DOMParser);
}

const { PARSERS, SERIALIZERS } = loadEngine();

// Mirrors the defaults in the page's state.opts.
const DEFAULT_OPTS = {
  jsonIndent: 2,
  yamlIndent: 2,
  xmlIndent: 2,
  xmlRoot: 'rows',
  xmlItem: 'row',
  sqlTable: 'data',
  sqlQuote: 'backtick',
  coerceTypes: true,
  strictParse: false,
  csvDelimiterIn: 'comma',
  csvDelimiterOut: 'comma',
};

// The router from ARCHITECTURE.md: parse in the source format, serialize
// in the target format, plain JS values in the middle.
function convert(input, from, to, opts) {
  if (!PARSERS[from]) throw new Error(`unknown source format: ${from}`);
  if (!SERIALIZERS[to]) throw new Error(`unknown target format: ${to}`);
  const merged = { ...DEFAULT_OPTS, ...opts };
  const value = PARSERS[from](input, merged);
  return SERIALIZERS[to](value, merged);
}

module.exports = { PARSERS, SERIALIZERS, convert, DEFAULT_OPTS };
