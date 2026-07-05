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

  await browser.close();

  for (const f of failures) console.error('FAIL  ' + f);
  for (const e of pageErrors) console.error('PAGEERROR  ' + e);
  if (failures.length || pageErrors.length) process.exit(1);
  console.log('SMOKE OK (5 cases)');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
