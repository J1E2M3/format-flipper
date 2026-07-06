'use strict';

// Codifies the "your data never leaves your device" guarantee: outside
// the two declared external <script> tags (commandk.js and Plausible),
// index.html must contain no network or persistence API at all. If a
// future change legitimately needs one (e.g. a documented localStorage
// key), add a narrow allowlist entry here alongside the FAQ/privacy
// disclosure — never silently.

const fs = require('node:fs');
const path = require('node:path');
const { test, assert, assertEq } = require('./runner');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Strip the two known external script tags, then scan everything else.
const externalTag = /<script[^>]*\bsrc="[^"]*"[^>]*><\/script>/g;
const externalTags = html.match(externalTag) || [];
const rest = html.replace(externalTag, '');

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/sendBeacon/, 'sendBeacon'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/localStorage/, 'localStorage'],
  [/sessionStorage/, 'sessionStorage'],
  [/document\.cookie/, 'document.cookie'],
  [/indexedDB/i, 'indexedDB'],
];

test('no-network: exactly the two declared external scripts exist', () => {
  assertEq(externalTags.length, 2, 'external script tags: ' + JSON.stringify(externalTags));
  assert(/commandk\.js/.test(externalTags[0]), 'first external script should be commandk.js');
  assert(/plausible\.io/.test(externalTags[1]), 'second external script should be plausible');
});

test('no-network: no network or persistence API outside the declared scripts', () => {
  for (const [re, name] of FORBIDDEN) {
    assert(!re.test(rest), `${name} found in index.html outside the declared external scripts`);
  }
});
