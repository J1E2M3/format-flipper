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
// you forget.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = path.join(__dirname, '..', 'index.html');

function inlineScriptHashes(html) {
  const hashes = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;               // external
    if (/application\/ld\+json/.test(attrs)) continue;   // data, not executed
    const digest = crypto.createHash('sha256').update(m[2], 'utf8').digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

function buildCsp(html) {
  const scriptHashes = inlineScriptHashes(html).join(' ');
  return [
    "default-src 'self'",
    // Inline blocks are hash-pinned; the only external script origin is Plausible.
    `script-src 'self' https://plausible.io ${scriptHashes}`,
    // The stylesheet is one inline <style> plus a few style attributes;
    // CSS is not the exfiltration vector this policy defends against.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The page's own code makes zero network calls; Plausible's beacon is
    // the single allowed destination ('self' covers /commandk.js needs).
    "connect-src 'self' https://plausible.io",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

function updatedHtml(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(html)}">`;
  const existing = /<meta http-equiv="Content-Security-Policy"[^>]*>/;
  if (existing.test(html)) return html.replace(existing, tag);
  const anchor = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  return html.replace(anchor, anchor + '\n' + tag);
}

const html = fs.readFileSync(FILE, 'utf8');
const next = updatedHtml(html);

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
