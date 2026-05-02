# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

The entire tool is **one HTML file**: `index.html` (~1600 lines). There is no build step, no framework, no `package.json`, no `node_modules`, no transpilation. CSS, JS, and the bundled js-yaml dependency all live inline inside `index.html`. This is intentional and a hard project constraint — see "Philosophy" below before adding any infrastructure.

The only other top-level files are documentation: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `LICENSE`.

## Commands

There is nothing to install or build.

```bash
# Run the tool: just open index.html in any browser.
xdg-open index.html   # or double-click

# For a dev loop with live reload, serve statically:
python3 -m http.server 8080
# or: npx serve

# Tests (per README/CONTRIBUTING):
node test/run.js
```

Note: as of writing, the `test/` directory does not yet exist in the repo even though `README.md` and `CONTRIBUTING.md` reference `node test/run.js`. If you add tests, create `test/run.js` matching that contract (plain Node, no test framework).

There is **no linter** and no formatter config. Style is enforced by convention (see below).

## Architecture: star topology

Read `ARCHITECTURE.md` in full before changing parsers/serializers. The short version:

- N formats × (N−1) directions would be 72 conversion functions. Instead, every format has **one parser** (`format → JS value`) and **one serializer** (`JS value → format`). Conversion is `SERIALIZERS[to](PARSERS[from](input))`.
- The intermediate representation is **plain JavaScript values** — objects, arrays, strings, numbers, booleans, null. No AST, no wrapper types, no traversal helpers. This is load-bearing: don't introduce a custom node type without rewriting the architecture doc first.
- Adding a format = write `parseXxx` + `serializeXxx`, register both in `PARSERS` and `SERIALIZERS`, add a `<option>` to the format selector. No combinatorial work.

Three documented places where the topology is lossy by design — **don't try to fix these without a design discussion**:
1. **Comments** are dropped on parse (no place to store them in plain JS values).
2. **Dates** round-trip as ISO 8601 strings (TOML date → JSON string → TOML string).
3. **Numbers >2^53** lose precision (clamped by JS `Number`).

## Where things live in `index.html`

Approximate landmarks (line numbers drift; grep to confirm):

- Lines ~1–460: `<head>` (meta, schema.org JSON-LD, fonts) and HTML body markup.
- Lines ~643–647: Inline bundle of **js-yaml 4.1.1** (~39 KB minified). Do not edit this block — it's a vendored dependency.
- Lines ~652+: Main IIFE containing all parsers, serializers, the registry, state, and UI logic.
- `parseJson`, `parseYaml`, `parseDelimited`/`parseCsv`/`parseTsv`, `parseXml`, `parseMarkdownTable`, `parseHtmlTable`, `parseSqlInsert`, `parseToml` — each in its own block.
- Matching `serialize*` functions follow the parsers.
- `const PARSERS = { ... }` and `const SERIALIZERS = { ... }` (around line 1351–1352): the registry. Adding a format means adding an entry here, plus to `FORMAT_LABELS` and `FORMAT_EXT`.

js-yaml is exposed as `window.jsyaml`; YAML parse/serialize delegate to it.

## Conventions for parsers and serializers

From `CONTRIBUTING.md`, and consistent across the existing 9 implementations:

- **Throw on malformed input.** The UI surfaces thrown errors; do not silently drop data or return `null`.
- **Preserve key/row order.** Use plain object literals and arrays — they preserve insertion order, which users notice.
- **Handle the top-level scalar case.** Most formats can express a bare string/number at the top; parsers should too.
- **Quote ambiguous strings on serialize.** If a string would re-parse as a number, boolean, or null, quote it.
- **Flatten unrepresentable values.** Tabular formats (CSV/TSV/SQL) can't hold nested objects; pick a clear convention and apply it consistently.

## Code style

Plain JavaScript, no linter, enforced by convention:

- 2-space indent, semicolons always, single quotes (double when the string contains single quotes).
- `const` first, then `let`. Avoid `var`.
- **Functions, not classes.** The codebase deliberately avoids OO ceremony.
- **No new external dependencies without discussion.** Current count is 1 (js-yaml, bundled inline). Anything that requires `npm install` defeats the single-file design.

## Philosophy (this is project policy, not advice)

`README.md` and `CONTRIBUTING.md` are explicit: contributions that move this toward "a proper web app with a framework and a build step" will be declined. Specifically, do **not** propose:

- A bundler (Webpack, Vite, esbuild, Rollup, ...).
- A framework (React, Vue, Svelte, ...).
- TypeScript or any transpiler.
- An `npm install` step or `package.json` with runtime deps.
- Splitting `index.html` into multiple files served separately at runtime.

The single-file design exists for durability, offline use, forkability via View Source, and zero supply-chain surface. Treat any change that erodes those properties as out of scope unless the user explicitly says otherwise.

Extracting parsers into a reusable npm package for server-side use is on the roadmap as a *separate* artifact — not as a replacement for the single-file tool.
