'use strict';

// Browser smoke test: node test/browser-smoke.js
//
// Loads index.html in headless Chromium and drives real conversions
// through the page UI — the wiring (selects, debounce, error surface)
// that the Node unit suite cannot see. Requires Playwright; when it is
// not installed this script skips locally and fails in CI.
//
// Failure policy: only wrong output or a page JavaScript exception
// fails the run. Console errors and failed resource loads are ignored —
// under file:// the page cannot reach /commandk.js or the analytics
// script, and that noise is not a defect in the tool.

const path = require('node:path');
const { execSync } = require('node:child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    // fall through to the global installation
  }
  try {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  } catch (e) {
    if (process.env.CI) {
      console.error('FAIL: playwright is required in CI but could not be loaded');
      process.exit(1);
    }
    console.log('SKIP: playwright not installed (npm i -g playwright && npx playwright install chromium)');
    process.exit(0);
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const failures = [];
  const pageErrors = [];

  const page = await browser.newPage();
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));

  const runCase = async (name, from, to, input, markers) => {
    await page.selectOption('#fromSelect', from);
    await page.selectOption('#toSelect', to);
    await page.fill('#sourceInput', input);
    for (const marker of markers) {
      try {
        await page.waitForFunction(
          m => document.querySelector('#outputArea').value.includes(m),
          marker,
          { timeout: 5000 }
        );
      } catch (e) {
        const output = await page.inputValue('#outputArea');
        failures.push(`${name}: expected output to contain ${JSON.stringify(marker)}, got ${JSON.stringify(output.slice(0, 200))}`);
      }
    }
  };

  await runCase(
    'jsonc → yaml',
    'json', 'yaml',
    '{"name": "Tooly", "tools": ["a", "b"], // jsonc comment\n}',
    ['name: Tooly', '- a']
  );

  await runCase(
    'json → sql',
    'json', 'sql',
    '[{"id": 1, "name": "Ada"}, {"id": 2, "name": "O\'Brien"}]',
    ['CREATE TABLE `data`', "O''Brien"]
  );

  await runCase(
    'escaped-pipe md → json',
    'md', 'json',
    '| a | b |\n|---|---|\n| 1 | x \\| y |',
    ['"x | y"']
  );

  await runCase(
    'xml attributes → json',
    'xml', 'json',
    '<user id="7" admin="true"><name>Ada</name></user>',
    ['"@id": 7', '"@admin": true']
  );

  await runCase(
    'ndjson → json',
    'ndjson', 'json',
    '{"id": 1}\n{"id": 2}',
    ['"id": 2']
  );

  await runCase(
    'json → ini',
    'json', 'ini',
    '{"a": {"b": 1}}',
    ['[a]', 'b = 1']
  );

  await runCase(
    'properties → json',
    'properties', 'json',
    'server.host = localhost\nserver.port = 8080',
    ['"server.host": "localhost"', '"server.port": 8080']
  );

  // Sample chips for the new formats load and convert
  await page.selectOption('#toSelect', 'json');
  await page.click('.sample-chip[data-sample="logs"]');
  try {
    await page.waitForFunction(
      () => document.querySelector('#outputArea').value.includes('"msg": "upstream timeout"'),
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('ndjson sample chip: expected log records in JSON output');
  }
  await page.click('.sample-chip[data-sample="settings"]');
  try {
    await page.waitForFunction(
      () => document.querySelector('#outputArea').value.includes('"width": 1280'),
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('ini sample chip: expected settings in JSON output');
  }

  // Error path: malformed JSON must surface in #sourceError, not crash
  await page.selectOption('#fromSelect', 'json');
  await page.selectOption('#toSelect', 'yaml');
  await page.fill('#sourceInput', '{nope');
  try {
    await page.waitForFunction(
      () => document.querySelector('#sourceError').classList.contains('show'),
      undefined,
      { timeout: 5000 }
    );
    const errText = await page.textContent('#sourceError');
    if (!errText.startsWith('Parse error:')) {
      failures.push(`error path: expected "Parse error:" prefix, got ${JSON.stringify(errText.slice(0, 100))}`);
    }
    const output = await page.inputValue('#outputArea');
    if (output !== '') {
      failures.push(`error path: expected empty output, got ${JSON.stringify(output.slice(0, 100))}`);
    }
  } catch (e) {
    failures.push('error path: #sourceError never gained the "show" class');
  }

  // Fragment load: settings-only URL restores formats and options
  const fileUrl = 'file://' + path.join(__dirname, '..', 'index.html');
  const page2 = await browser.newPage();
  page2.on('pageerror', err => pageErrors.push('page2: ' + err.message));
  await page2.goto(fileUrl + '#from=yaml&to=json&jsonIndent=4');
  try {
    await page2.waitForFunction(
      () => document.querySelector('#fromSelect').value === 'yaml' &&
            document.querySelector('#toSelect').value === 'json',
      undefined,
      { timeout: 5000 }
    );
    await page2.fill('#sourceInput', 'a: 1');
    await page2.waitForFunction(
      () => document.querySelector('#outputArea').value.includes('    "a": 1'),
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('fragment load: selects/options did not restore from #from=yaml&to=json&jsonIndent=4');
  }
  await page2.close();

  // Hash auto-sync: changing settings updates the fragment
  await page.selectOption('#fromSelect', 'json');
  await page.selectOption('#toSelect', 'sql');
  try {
    await page.waitForFunction(
      () => location.hash.includes('to=sql'),
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('hash sync: location.hash did not reflect to=sql');
  }

  // Keyboard swap: Ctrl+Shift+S swaps from/to
  await page.selectOption('#fromSelect', 'json');
  await page.selectOption('#toSelect', 'yaml');
  await page.fill('#sourceInput', '{"a": 1}');
  try {
    await page.waitForFunction(
      () => document.querySelector('#outputArea').value.includes('a: 1'),
      undefined,
      { timeout: 5000 }
    );
    await page.keyboard.press('Control+Shift+S');
    await page.waitForFunction(
      () => document.querySelector('#fromSelect').value === 'yaml',
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('keyboard swap: Ctrl+Shift+S did not swap formats');
  }

  // Delimiter option end-to-end through the real options UI
  await page.selectOption('#fromSelect', 'csv');
  await page.selectOption('#toSelect', 'json');
  try {
    await page.selectOption('#opt-csvDelimiterIn', 'semicolon');
    await page.fill('#sourceInput', 'a;b\n1;2');
    await page.waitForFunction(
      () => document.querySelector('#outputArea').value.includes('"a": 1'),
      undefined,
      { timeout: 5000 }
    );
  } catch (e) {
    failures.push('delimiter option: semicolon csv did not parse via #opt-csvDelimiterIn');
  }

  await browser.close();

  for (const f of failures) console.error('FAIL  ' + f);
  for (const e of pageErrors) console.error('PAGEERROR  ' + e);
  if (failures.length || pageErrors.length) process.exit(1);
  console.log('SMOKE OK (13 cases)');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
