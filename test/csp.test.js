'use strict';

// The CSP meta tag pins sha256 hashes of the inline <script> blocks.
// Editing the page's JavaScript without re-running tools/update-csp.js
// would ship a policy that blocks the page's own code — catch it here.

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { test, assert } = require('./runner');

test('csp: meta tag matches current inline script hashes', () => {
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'update-csp.js'), '--check']);
  } catch (e) {
    assert(false, 'stale CSP — run: node tools/update-csp.js');
  }
});

test('csp: plausible script carries SRI integrity and crossorigin', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*src="https:\/\/plausible\.io[^>]*>/);
  assert(m, 'plausible script tag not found');
  assert(/integrity="sha384-[A-Za-z0-9+/=]+"/.test(m[0]), 'missing SRI integrity attribute');
  assert(/crossorigin="anonymous"/.test(m[0]), 'missing crossorigin="anonymous"');
});
