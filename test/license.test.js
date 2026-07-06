'use strict';

// The Pro license scheme: tools/sign-license.js signs with the (demo)
// Ed25519 private key; the page verifies against the PRO_PUBLIC_KEY
// constant embedded in index.html. These tests prove the two halves
// actually match, using Node's crypto in place of WebCrypto.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test, assert, assertEq } = require('./runner');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function pagePublicKey() {
  const m = html.match(/PRO_PUBLIC_KEY = '([A-Za-z0-9+/=]+)'/);
  assert(m, 'PRO_PUBLIC_KEY not found in index.html');
  const raw = Buffer.from(m[1], 'base64');
  assertEq(raw.length, 32, 'Ed25519 public key must be 32 bytes');
  // Wrap raw key in SPKI DER so node crypto can import it.
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
  return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

function b64uDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

test('license: a signed key verifies against the public key in index.html', () => {
  const key = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'sign-license.js'), 'ada@example.com'])
    .toString().trim();
  const [prefix, payloadB, sigB] = key.split('.');
  assertEq(prefix, 'FF1');
  const payload = b64uDecode(payloadB);
  const ok = crypto.verify(null, payload, pagePublicKey(), b64uDecode(sigB));
  assert(ok, 'signature must verify with the embedded public key');
  const data = JSON.parse(payload.toString());
  assertEq(data.email, 'ada@example.com');
  assertEq(data.plan, 'pro');
});

test('license: a tampered payload fails verification', () => {
  const key = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'sign-license.js'), 'ada@example.com'])
    .toString().trim();
  const [, payloadB, sigB] = key.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'eve@example.com', plan: 'pro' }));
  const ok = crypto.verify(null, forged, pagePublicKey(), b64uDecode(sigB));
  assert(!ok, 'forged payload must not verify');
  // sanity: the original still does
  assert(crypto.verify(null, b64uDecode(payloadB), pagePublicKey(), b64uDecode(sigB)));
});
