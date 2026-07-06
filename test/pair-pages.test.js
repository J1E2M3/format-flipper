'use strict';

// The per-pair landing pages are generated from index.html by
// tools/build-pair-pages.js. Keep them current, and prove each page is
// internally consistent: CSP hashes match its (modified) inline script,
// and the preselected pair agrees between the state literal, the two
// <select> lists, and the canonical URL.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test, assert } = require('./runner');
const { applyCsp } = require('../tools/csp-lib');
const { PAIRS, slugFor } = require('../tools/build-pair-pages');

const ROOT = path.join(__dirname, '..');

test('pair pages: generated pages and sitemap are current', () => {
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-pair-pages.js'), '--check']);
  } catch (e) {
    assert(false, 'stale pair pages — run: node tools/build-pair-pages.js');
  }
});

test('pair pages: each page is internally consistent', () => {
  for (const p of PAIRS) {
    const slug = slugFor(p);
    const html = fs.readFileSync(path.join(ROOT, slug, 'index.html'), 'utf8');
    assert(applyCsp(html) === html, `${slug}: CSP hashes do not match the page's inline scripts`);
    assert(html.includes(`from: '${p.from}',`), `${slug}: state.from not preset`);
    assert(html.includes(`to: '${p.to}',`), `${slug}: state.to not preset`);
    assert(html.includes(`canonical" href="https://toolymctoolface.com/format/${slug}/"`), `${slug}: canonical URL wrong`);
    const fromSel = html.match(/<select class="format-select" id="fromSelect"[\s\S]*?<\/select>/)[0];
    const toSel = html.match(/<select class="format-select" id="toSelect"[\s\S]*?<\/select>/)[0];
    assert(fromSel.includes(`value="${p.from}" selected`), `${slug}: fromSelect not preselected`);
    assert(toSel.includes(`value="${p.to}" selected`), `${slug}: toSelect not preselected`);
    assert((toSel.match(/ selected/g) || []).length === 1, `${slug}: toSelect has multiple selected options`);
  }
});

test('pair pages: sitemap lists the tool, every pair, and the policy pages', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert(sitemap.includes('https://toolymctoolface.com/format/</loc>'), 'tool URL missing');
  for (const p of PAIRS) {
    assert(sitemap.includes(`/format/${slugFor(p)}/`), `${slugFor(p)} missing from sitemap`);
  }
  for (const page of ['privacy', 'terms', 'accessibility']) {
    assert(sitemap.includes(`/format/${page}/`), `${page} missing from sitemap`);
  }
});
