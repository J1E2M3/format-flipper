'use strict';

// Generate the per-pair landing pages from index.html.
//
//   node tools/build-pair-pages.js          # (re)generate <slug>/index.html + sitemap.xml
//   node tools/build-pair-pages.js --check  # exit 1 if any generated page is stale
//
// Every one of the 132 conversion pairs already works through the one
// engine — but they all live behind a URL fragment search engines never
// see. These pages give the highest-volume pairs real, indexable URLs
// (/format/csv-to-json/ etc.). Each page IS the full tool with the pair
// pre-selected, plus a unique title/description/H1 and two paragraphs of
// pair-specific notes drawn from the documented conversion gotchas.
// index.html stays the single source of truth; regenerate after editing it.

const fs = require('node:fs');
const path = require('node:path');
const { applyCsp } = require('./csp-lib');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://toolymctoolface.com/format/';

const LABELS = {
  json: 'JSON', ndjson: 'NDJSON', yaml: 'YAML', toml: 'TOML', ini: 'INI',
  properties: '.properties', csv: 'CSV', tsv: 'TSV', xml: 'XML',
  md: 'Markdown', html: 'HTML', sql: 'SQL',
};

// The dozen highest-intent pairs (matching the long-tail phrases already
// in the meta keywords), each with pair-specific notes.
const PAIRS = [
  {
    from: 'csv', to: 'json',
    desc: 'Convert CSV to JSON free, in your browser — no upload, no account. Paste CSV, get a JSON array of objects instantly. Quotes, commas, and newlines handled.',
    intro: 'Paste CSV, get a JSON array of objects — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['How the conversion works', 'The first CSV row becomes the JSON keys; every following row becomes one object. Quoted fields with embedded commas, quotes, and newlines are handled per RFC 4180. Numbers and booleans are typed automatically (<code>"42"</code> becomes <code>42</code>) — turn off &ldquo;Coerce types&rdquo; in Options to keep every cell a string.'],
      ['Semicolons, pipes, and tabs', 'European-style semicolon CSV? Set the input delimiter in Options — comma, semicolon, pipe, or tab. Enable &ldquo;Strict parsing&rdquo; to make ragged rows fail loudly with a row number instead of being silently backfilled.'],
    ],
  },
  {
    from: 'json', to: 'csv',
    desc: 'Convert JSON to CSV free, in your browser — no upload, no account. Paste a JSON array of objects, get spreadsheet-ready CSV instantly.',
    intro: 'Paste a JSON array of objects, get spreadsheet-ready CSV — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['What shape the JSON needs', 'CSV is tabular, so the JSON should be an array of objects sharing the same keys — <code>[{"id": 1, "name": "Ada"}, …]</code>. Objects nested deeper than one level don&rsquo;t fit a flat grid; the converter tells you loudly rather than silently mangling them.'],
      ['Escaping is handled for you', 'Fields containing commas, quotes, or newlines are double-quoted and inner quotes doubled, per RFC 4180 — the file opens cleanly in Excel, Google Sheets, and every CSV parser. Pick a semicolon, pipe, or tab output delimiter in Options if your target tool expects one.'],
    ],
  },
  {
    from: 'json', to: 'yaml',
    desc: 'Convert JSON to YAML free, in your browser — no upload, no account. Comments-free, indentation-correct YAML from any JSON, instantly.',
    intro: 'Paste JSON, get clean YAML — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Ambiguous strings stay strings', 'Values like <code>"yes"</code>, <code>"no"</code>, <code>"on"</code>, and version numbers like <code>"1.2"</code> are quoted in the YAML output so they round-trip as strings — avoiding the classic Norway problem where <code>no</code> silently becomes <code>false</code>.'],
      ['JSONC accepted as input', 'The JSON parser accepts comments and trailing commas (JSONC), so you can paste straight from a config file. Set the YAML indent width in Options.'],
    ],
  },
  {
    from: 'yaml', to: 'json',
    desc: 'Convert YAML to JSON free, in your browser — no upload, no account. YAML 1.2 parsing via js-yaml, formatted JSON out, instantly.',
    intro: 'Paste YAML, get formatted JSON — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Full YAML 1.2 parsing', 'Parsing uses js-yaml (bundled into the page — nothing fetched at convert time), so anchors, aliases, multi-line strings, and nested structures all resolve correctly into JSON.'],
      ['What gets lost', 'JSON has no comment syntax, so YAML comments are dropped — that&rsquo;s the format, not a bug. Dates become ISO 8601 strings. Set the JSON indent (including 0 for minified) in Options.'],
    ],
  },
  {
    from: 'json', to: 'toml',
    desc: 'Convert JSON to TOML free, in your browser — no upload, no account. Config-ready TOML with proper tables and typed values, instantly.',
    intro: 'Paste JSON, get config-ready TOML — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Objects become tables', 'Top-level scalar keys serialize first, then nested objects become <code>[table]</code> sections and arrays of objects become <code>[[array-of-tables]]</code> — idiomatic TOML, not a JSON dump with different punctuation.'],
      ['One shape restriction', 'TOML requires a top-level table, so a bare JSON array like <code>[1, 2, 3]</code> can&rsquo;t become a TOML document — the converter says so explicitly instead of inventing a wrapper key.'],
    ],
  },
  {
    from: 'toml', to: 'json',
    desc: 'Convert TOML to JSON free, in your browser — no upload, no account. Full TOML 1.0 parsing: tables, dotted keys, multi-line strings, hex ints.',
    intro: 'Paste TOML, get formatted JSON — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Full TOML 1.0 support', 'Tables, inline tables, arrays of tables, dotted keys, multi-line strings, dates, and hex/octal/binary integers all parse. Errors come back with the exact line number.'],
      ['Dates and big integers', 'TOML dates become ISO 8601 strings in JSON (JSON has no date type). Integers beyond 2<sup>53</sup> lose precision in JavaScript — stringify them in the source if exactness matters.'],
    ],
  },
  {
    from: 'csv', to: 'sql',
    desc: 'Convert CSV to SQL INSERT statements free, in your browser — no upload. CREATE TABLE with inferred types plus INSERT rows, instantly.',
    intro: 'Paste CSV, get a CREATE TABLE and INSERT statements — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Types are inferred', 'The output includes a <code>CREATE TABLE</code> with INTEGER/REAL/BOOLEAN/TEXT column types inferred from the data, then one multi-row <code>INSERT</code>. Apostrophes are escaped by doubling (<code>O&rsquo;&rsquo;Brien</code>), NULLs handled.'],
      ['Pick your dialect&rsquo;s quoting', 'Identifier quoting is selectable in Options: MySQL backticks (default), ANSI double quotes for Postgres, or SQL Server brackets. Set the table name there too.'],
    ],
  },
  {
    from: 'json', to: 'sql',
    desc: 'Convert JSON to SQL INSERT statements free, in your browser — no upload. Array of objects in, CREATE TABLE + INSERT out, instantly.',
    intro: 'Paste a JSON array, get CREATE TABLE + INSERT statements — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['From API response to seed data', 'Any JSON array of flat objects becomes a ready-to-run <code>CREATE TABLE</code> (typed columns inferred from the values) plus a multi-row <code>INSERT</code> — handy for turning an API response into database seed data.'],
      ['Dialect options', 'Choose MySQL backtick, ANSI, or SQL Server bracket identifier quoting in Options, and set the table name. String escaping follows the SQL standard (doubled apostrophes).'],
    ],
  },
  {
    from: 'xml', to: 'json',
    desc: 'Convert XML to JSON free, in your browser — no upload, no account. Attributes, text nodes, and repeated elements mapped predictably.',
    intro: 'Paste XML, get predictable JSON — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['A predictable mapping', 'Attributes become <code>@</code>-prefixed keys, element text becomes the value (or <code>#text</code> when attributes are present), and repeated sibling elements become arrays. Malformed XML reports a parse error instead of guessing.'],
      ['Typed values', 'Text like <code>"true"</code> and <code>"42"</code> is typed automatically; turn off &ldquo;Coerce types&rdquo; in Options to keep every value exactly the string in the markup.'],
    ],
  },
  {
    from: 'json', to: 'xml',
    desc: 'Convert JSON to XML free, in your browser — no upload, no account. Configurable root and item tags, proper escaping, indented output.',
    intro: 'Paste JSON, get well-formed XML — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['You control the tag names', 'Set the root tag and the per-item tag in Options (defaults: <code>rows</code>/<code>row</code>). Nested objects become nested elements; <code>&amp;</code>, <code>&lt;</code>, and friends are escaped correctly.'],
      ['Arrays and objects both work', 'An array of records produces one item element per record; a single object produces one nested document. Indent width is configurable, including 0 for compact output.'],
    ],
  },
  {
    from: 'csv', to: 'md',
    desc: 'Convert CSV to a Markdown table free, in your browser — no upload. GitHub-flavored pipe tables with proper escaping, instantly.',
    intro: 'Paste CSV, get a GitHub-ready Markdown table — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['GitHub-flavored output', 'The output is a GFM pipe table that renders on GitHub, GitLab, and in most Markdown editors. Pipes inside cell values are escaped as <code>\\|</code> and newlines become <code>&lt;br&gt;</code>, so the table never breaks.'],
      ['Round-trips cleanly', 'The Markdown parser here understands its own escaping, so CSV &rarr; Markdown &rarr; CSV returns the original data. Delimiter and strict-parsing options apply on the CSV side.'],
    ],
  },
  {
    from: 'yaml', to: 'toml',
    desc: 'Convert YAML to TOML free, in your browser — no upload, no account. Config file migration with tables, typed values, and exact errors.',
    intro: 'Paste YAML, get idiomatic TOML — instantly, entirely in your browser. <em>Your data never leaves your device.</em>',
    notes: [
      ['Config migration, done properly', 'Nested YAML mappings become TOML <code>[table]</code> sections, lists of mappings become <code>[[array-of-tables]]</code>, and scalars keep their types. Comments are dropped — neither format can carry the other&rsquo;s comment syntax through a data model.'],
      ['Shape rule to know', 'TOML documents must be a top-level table, so a YAML document that is a bare list can&rsquo;t convert — the error says exactly that. Everything else flows through the same engine as every other pair here.'],
    ],
  },
];

function slugFor(p) { return `${p.from}-to-${p.to}`; }

function buildPage(src, p) {
  const fromL = LABELS[p.from];
  const toL = LABELS[p.to];
  const slug = slugFor(p);
  const url = BASE + slug + '/';
  let html = src;

  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`anchor not found for ${slug}: ${JSON.stringify(from.slice(0, 60))}`);
    html = html.split(from).join(to);
  };

  // Head: title, description, canonical, og:*, JSON-LD url
  swap(
    /<title>[\s\S]*?<\/title>/.exec(html)[0],
    `<title>${fromL} to ${toL} Converter — Free, No Upload · Tooly McToolface</title>`
  );
  swap(
    /<meta name="description" content="[^"]*">/.exec(html)[0],
    `<meta name="description" content="${p.desc}">`
  );
  swap('<link rel="canonical" href="https://toolymctoolface.com/format/">',
       `<link rel="canonical" href="${url}">`);
  swap('<meta property="og:url" content="https://toolymctoolface.com/format/">',
       `<meta property="og:url" content="${url}">`);
  swap(
    /<meta property="og:title" content="[^"]*">/.exec(html)[0],
    `<meta property="og:title" content="${fromL} to ${toL} Converter — free, in your browser">`
  );
  swap('"url": "https://toolymctoolface.com/format/",', `"url": "${url}",`);

  // Relative asset/page links go one directory up
  swap("url('fonts/", "url('../fonts/");
  swap('href="fonts/', 'href="../fonts/');
  swap('href="privacy.html"', 'href="../privacy.html"');
  swap('href="terms.html"', 'href="../terms.html"');
  swap('href="accessibility.html"', 'href="../accessibility.html"');
  // The back-to-tool crumb target for these pages is the parent directory.

  // Hero
  swap('<div class="eyebrow">Format Flipper · 12 formats · 132 directions</div>',
       `<div class="eyebrow">Format Flipper · ${fromL} → ${toL} · <a href="../">all 132 directions</a></div>`);
  swap('<h1>JSON, CSV, YAML, <span class="swash">flipped.</span></h1>',
       `<h1>${fromL} to ${toL}, <span class="swash">flipped.</span></h1>`);
  swap('<p>Paste data in any of 12 formats. Pick what you want it to become. Get it instantly. <em>Works entirely in your browser</em> — your data never leaves your device.</p>',
       `<p>${p.intro}</p>`);

  // Pre-select the pair: state literal, <option selected>, panel titles
  swap("  from: 'json',\n  to: 'csv',", `  from: '${p.from}',\n  to: '${p.to}',`);
  const fromSelect = /<select class="format-select" id="fromSelect"[\s\S]*?<\/select>/.exec(html)[0];
  swap(fromSelect, fromSelect
    .replace(` value="${p.from}">`, ` value="${p.from}" selected>`));
  const toSelect = /<select class="format-select" id="toSelect"[\s\S]*?<\/select>/.exec(html)[0];
  swap(toSelect, toSelect
    .replace(' value="csv" selected>', ' value="csv">')
    .replace(` value="${p.to}">`, ` value="${p.to}" selected>`));
  swap('id="sourceHeadTitle">Source · JSON<', `id="sourceHeadTitle">Source · ${fromL === '.properties' ? 'Properties' : fromL}<`);
  swap('id="outputHeadTitle">Output · CSV<', `id="outputHeadTitle">Output · ${toL === '.properties' ? 'Properties' : toL}<`);

  // Pair-specific notes section before the FAQ, reusing existing styles
  const notes = `  <section class="education">
    <h2>${fromL} → ${toL}, <span class="swash">specifically.</span></h2>
    <div class="faq-grid">
${p.notes.map(([h, body]) => `      <div class="faq-item">
        <h3>${h}</h3>
        <p>${body}</p>
      </div>`).join('\n')}
    </div>
  </section>

  <section id="faq" class="education">`;
  swap('  <section id="faq" class="education">', notes);

  // Recompute the CSP hashes for this page's modified inline script
  return applyCsp(html);
}

function generated() {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = {};
  for (const p of PAIRS) {
    files[path.join(slugFor(p), 'index.html')] = buildPage(src, p);
  }

  const urls = [
    { loc: BASE, freq: 'monthly', pri: '1.0' },
    ...PAIRS.map(p => ({ loc: BASE + slugFor(p) + '/', freq: 'monthly', pri: '0.8' })),
    { loc: BASE + 'privacy/', freq: 'yearly', pri: '0.3' },
    { loc: BASE + 'terms/', freq: 'yearly', pri: '0.3' },
    { loc: BASE + 'accessibility/', freq: 'yearly', pri: '0.3' },
  ];
  files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n') +
    '\n</urlset>\n';

  return files;
}

const files = generated();
const check = process.argv.includes('--check');
let stale = false;

for (const [rel, content] of Object.entries(files)) {
  const target = path.join(ROOT, rel);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === content) continue;
  if (check) {
    console.error(`${rel} is stale`);
    stale = true;
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log('wrote ' + rel);
  }
}

if (check) {
  if (stale) {
    console.error('run: node tools/build-pair-pages.js');
    process.exit(1);
  }
  console.log(`all ${PAIRS.length} pair pages + sitemap are current`);
} else {
  console.log(`pair pages: ${PAIRS.length} generated`);
}

module.exports = { PAIRS, slugFor };
