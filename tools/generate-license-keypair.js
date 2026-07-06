'use strict';

// Generate an Ed25519 keypair for Pro license signing.
//
//   node tools/generate-license-keypair.js
//
// Prints the raw 32-byte public key (base64) to embed as PRO_PUBLIC_KEY
// in index.html, and writes the private key PEM to license-signing-key.pem
// in the current directory (keep it out of git; .gitignore covers it).
//
// The repo ships a DEMO keypair (tools/demo-license-key.pem + the matching
// PRO_PUBLIC_KEY in index.html) so tests and local development work out
// of the box. Before selling real keys, run this tool, replace
// PRO_PUBLIC_KEY with the new public key, and keep the new PEM private —
// the demo private key is public by definition.

const crypto = require('node:crypto');
const fs = require('node:fs');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

// Raw 32-byte public key = last 32 bytes of the SPKI DER encoding.
const spki = publicKey.export({ type: 'spki', format: 'der' });
const raw = spki.subarray(spki.length - 32);

fs.writeFileSync('license-signing-key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
console.log('private key written to ./license-signing-key.pem — keep it secret');
console.log('PRO_PUBLIC_KEY (embed in index.html):');
console.log(raw.toString('base64'));
