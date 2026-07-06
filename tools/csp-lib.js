'use strict';

// Shared CSP builder for index.html and the generated pair pages.
// The policy locks script-src to 'self' + Plausible + sha256 hashes of
// each executable inline <script> block, so it must be recomputed
// whenever those blocks change.

const crypto = require('node:crypto');

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

function applyCsp(html) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${buildCsp(html)}">`;
  const existing = /<meta http-equiv="Content-Security-Policy"[^>]*>/;
  if (existing.test(html)) return html.replace(existing, tag);
  const anchor = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  return html.replace(anchor, anchor + '\n' + tag);
}

module.exports = { inlineScriptHashes, buildCsp, applyCsp };
