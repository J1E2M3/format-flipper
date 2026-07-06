'use strict';

// Recompute the Content-Security-Policy meta tag in index.html.
//
//   node tools/update-csp.js          # rewrite the CSP meta tag in place
//   node tools/update-csp.js --check  # exit 1 if the tag is stale (used by tests)
//
// The page is entirely inline scripts, so script-src is locked down with
// sha256 hashes of each executable inline <script> block instead of
// 'unsafe-inline'. Any edit to those blocks changes the hashes — run this
// tool after editing the page's JavaScript. test/csp.test.js fails CI if
// you forget. Policy details live in tools/csp-lib.js (shared with the
// pair-page generator).

const fs = require('node:fs');
const path = require('node:path');
const { applyCsp } = require('./csp-lib');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const next = applyCsp(html);

if (process.argv.includes('--check')) {
  if (next !== html) {
    console.error('CSP meta tag is stale — run: node tools/update-csp.js');
    process.exit(1);
  }
  console.log('CSP meta tag is current');
} else {
  if (next === html) {
    console.log('CSP meta tag already current');
  } else {
    fs.writeFileSync(FILE, next);
    console.log('CSP meta tag updated');
  }
}
