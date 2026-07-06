'use strict';

// Format Flipper Conversion API — a SEPARATE product from the browser tool.
//
// The browser tool's promise is "your data never leaves your device."
// This server is the opposite trust boundary by design: clients send data
// here to be converted. The compensating promise, enforced in this file,
// is process-and-forget: request bodies are never logged, never written
// to disk, and never retained past the response. Only per-key usage
// COUNTS are persisted (for metered billing).
//
//   FF_API_KEYS="k1:alice,k2:bob" node server.js
//
// Environment:
//   PORT          listen port (default 8787)
//   FF_API_KEYS   comma-separated key:label pairs (required)
//   FF_USAGE_FILE where usage counters persist (default ./usage.json)
//   FF_MAX_BYTES  request body cap in bytes (default 10 MB)
//
// Endpoints:
//   GET  /healthz      liveness, no auth
//   GET  /v1/formats   list formats, no auth
//   POST /v1/convert   {"input": "...", "from": "csv", "to": "json", "opts": {...}}
//                      Authorization: Bearer <api key>
//
// Zero dependencies beyond the format-flipper engine package — node:http
// only, same no-supply-chain ethos as the rest of the project.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ff = require('format-flipper');

const PORT = parseInt(process.env.PORT || '8787', 10);
const MAX_BYTES = parseInt(process.env.FF_MAX_BYTES || String(10 * 1024 * 1024), 10);
const USAGE_FILE = process.env.FF_USAGE_FILE || path.join(__dirname, 'usage.json');

function loadKeys() {
  const raw = process.env.FF_API_KEYS || '';
  const keys = new Map();
  for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const idx = pair.indexOf(':');
    if (idx > 0) keys.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return keys;
}
const API_KEYS = loadKeys();
if (API_KEYS.size === 0) {
  console.error('FF_API_KEYS is empty — set FF_API_KEYS="key:label[,key:label]"');
  process.exit(1);
}

// ---- usage metering (counts only — never content) ----
let usage = {};
try { usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); } catch (e) { usage = {}; }
let usageDirty = false;

function recordUsage(label, bytesIn) {
  const u = usage[label] || (usage[label] = { conversions: 0, bytesIn: 0 });
  u.conversions += 1;
  u.bytesIn += bytesIn;
  usageDirty = true;
  // STRIPE INTEGRATION POINT: for metered billing, report one usage unit
  // per conversion to a Stripe subscription item here, e.g.:
  //   stripe.billing.meterEvents.create({ event_name: 'ff_conversion',
  //     payload: { stripe_customer_id: customerFor(label), value: '1' } })
  // Keep it fire-and-forget with a retry queue so billing latency never
  // blocks the conversion response.
}

setInterval(() => {
  if (!usageDirty) return;
  usageDirty = false;
  fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), () => {});
}, 5000).unref();

// ---- request handling ----
function send(res, status, body, extra) {
  const text = JSON.stringify(body, null, 2) + '\n';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(text);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > limit) {
        reject(Object.assign(new Error('request body exceeds ' + limit + ' bytes'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/v1/formats') {
    return send(res, 200, { formats: ff.FORMATS });
  }

  if (req.method === 'POST' && url.pathname === '/v1/convert') {
    const auth = req.headers.authorization || '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const label = key && API_KEYS.get(key);
    if (!label) {
      return send(res, 401, { error: 'missing or invalid API key' });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req, MAX_BYTES));
    } catch (err) {
      return send(res, err.status || 400, { error: err.status ? err.message : 'body must be valid JSON' });
    }

    const { input, from, to, opts } = body || {};
    if (typeof input !== 'string' || !from || !to) {
      return send(res, 400, { error: 'required fields: input (string), from, to' });
    }
    if (!ff.FORMATS.includes(from)) return send(res, 400, { error: 'unknown source format: ' + from });
    if (!ff.FORMATS.includes(to)) return send(res, 400, { error: 'unknown target format: ' + to });

    try {
      const output = ff.convert(input, from, to, opts || {});
      recordUsage(label, Buffer.byteLength(input));
      return send(res, 200, { output, from, to });
    } catch (err) {
      // Parse/shape errors are the client's data, status 422; message
      // text only — the input itself is never echoed or logged.
      return send(res, 422, { error: err.message });
    }
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`format-flipper API listening on :${PORT} (${API_KEYS.size} key${API_KEYS.size === 1 ? '' : 's'})`);
});

module.exports = server;
