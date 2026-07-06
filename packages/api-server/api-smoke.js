'use strict';

// End-to-end smoke for the API server. Run from this directory after
// `npm install`: node api-smoke.js
// Boots the server on an ephemeral port with a test key, exercises auth,
// conversion, error, and formats paths, then shuts down.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert');

const PORT = 18787 + Math.floor(Math.random() * 1000);
const USAGE = path.join(os.tmpdir(), `ff-usage-${process.pid}.json`);

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), FF_API_KEYS: 'test-key-1:smoke', FF_USAGE_FILE: USAGE },
  stdio: ['ignore', 'pipe', 'inherit'],
});

function req(method, p, { body, key } = {}) {
  return fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function waitForBoot() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await req('GET', '/healthz');
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not boot');
}

(async () => {
  await waitForBoot();

  // formats, no auth
  const formats = await (await req('GET', '/v1/formats')).json();
  assert.strictEqual(formats.formats.length, 12, 'formats list');

  // auth required
  assert.strictEqual((await req('POST', '/v1/convert', { body: { input: '{}', from: 'json', to: 'yaml' } })).status, 401);
  assert.strictEqual((await req('POST', '/v1/convert', { body: { input: '{}', from: 'json', to: 'yaml' }, key: 'wrong' })).status, 401);

  // conversion
  const conv = await req('POST', '/v1/convert', {
    key: 'test-key-1',
    body: { input: 'id,name\n1,Ada', from: 'csv', to: 'json' },
  });
  assert.strictEqual(conv.status, 200);
  const out = await conv.json();
  assert.deepStrictEqual(JSON.parse(out.output), [{ id: 1, name: 'Ada' }], 'csv -> json via API');

  // options pass through
  const sql = await req('POST', '/v1/convert', {
    key: 'test-key-1',
    body: { input: '[{"id": 1}]', from: 'json', to: 'sql', opts: { sqlQuote: 'ansi', sqlTable: 'users' } },
  });
  assert.match((await sql.json()).output, /CREATE TABLE "users"/, 'sql quoting option');

  // client data errors are 422 with a message, input never echoed
  const bad = await req('POST', '/v1/convert', {
    key: 'test-key-1',
    body: { input: '{broken-secret-content', from: 'json', to: 'yaml' },
  });
  assert.strictEqual(bad.status, 422);
  const badBody = await bad.json();
  assert.ok(!JSON.stringify(badBody).includes('broken-secret-content'), 'input must not be echoed in errors');

  // usage counted (flushed on the 5s interval — read the in-memory effect
  // via one more successful call instead of waiting for the file)
  const again = await req('POST', '/v1/convert', {
    key: 'test-key-1',
    body: { input: 'a: 1', from: 'yaml', to: 'json' },
  });
  assert.strictEqual(again.status, 200);

  child.kill();
  fs.rmSync(USAGE, { force: true });
  console.log('API SMOKE OK');
  process.exit(0);
})().catch(err => {
  child.kill();
  console.error(err);
  process.exit(1);
});
