# Format Flipper

**Convert between JSON, NDJSON, YAML, TOML, INI, .properties, CSV, TSV, XML, Markdown, HTML, and SQL — in your browser, without uploading your file anywhere.**

Live: **[toolymctoolface.com/format](https://toolymctoolface.com/format/)**

This is the source of Format Flipper, one of the tools in the [Tooly McToolface](https://toolymctoolface.com) workshop. Everything runs client-side. No server, no framework, no build step. The whole tool is a single HTML file you can download and open locally, forever, and it will still work.

---

## What it does

Twelve formats. 132 bidirectional conversions. A star-topology architecture that makes adding a new format cost O(1) effort.

Paste:

```json
{
  "name": "Tooly",
  "version": "1.2",
  "tools": ["compress", "json", "regex"]
}
```

Get any of the other eleven formats, in place, without a round-trip to any server:

**YAML:**
```yaml
name: Tooly
version: "1.2"
tools:
  - compress
  - json
  - regex
```

**TOML:**
```toml
name = "Tooly"
version = "1.2"
tools = ["compress", "json", "regex"]
```

**CSV:**
```csv
name,version,tools
Tooly,1.2,"compress, json, regex"
```

Every combination works in both directions — JSON → TOML, TOML → JSON, and also JSON → YAML → CSV → XML → JSON round-trips with predictable lossiness at each step.

## Supported formats

| Format | Parse | Serialize | Notes |
|--------|-------|-----------|-------|
| JSON | ✓ | ✓ | Strict parser, accepts JSONC (comments + trailing commas) as input |
| NDJSON | ✓ | ✓ | One JSON value per line, strict per-line parsing |
| YAML | ✓ | ✓ | js-yaml 4.1.1 (YAML 1.2 spec), bundled inline (~39 KB) |
| TOML | ✓ | ✓ | Custom parser, ~3 KB |
| INI | ✓ | ✓ | Sections + dotted nesting, `;` and `#` comments; arrays stored as JSON strings |
| .properties | ✓ | ✓ | Java-style: `=`/`:`/space separators, escapes, line continuations; keys stay flat |
| CSV | ✓ | ✓ | RFC 4180 with quoted-string handling |
| TSV | ✓ | ✓ | Same as CSV with tab delimiter |
| XML | ✓ | ✓ | Simple document model, attributes + text nodes |
| Markdown | ✓ | ✓ | GFM pipe tables — escaped pipes, `<br>` line breaks |
| HTML | ✓ | ✓ | Extracts `<table>` data; emits clean minimal tables |
| SQL | ✓ | ✓ | `CREATE TABLE` + `INSERT INTO` for tabular data round-tripping |

12 formats × 11 directions each = 132 bidirectional conversions.

## Options, shortcuts, and share links

- **CSV delimiters**: choose comma, semicolon, pipe, or tab — independently for parsing (`Input delimiter`) and output (`Output delimiter`). TSV has no option; tab-separated *is* the format.
- **SQL identifier quotes**: MySQL backticks (default), ANSI double quotes, or SQL Server brackets.
- **Coerce types**: on by default; turn it off to keep every tabular cell exactly the string you typed (`"007"` stays `"007"`).
- **Keyboard**: `Ctrl/⌘+Enter` converts, `Ctrl/⌘+Shift+S` swaps formats, `Ctrl/⌘+Shift+L` copies a settings link, `Esc` dismisses the toast.
- **Share links**: the current formats and options sync into the URL fragment (`#from=csv&to=json&…`), and "Copy settings link" puts a shareable URL on your clipboard. **Only settings are encoded — never your data.** Fragments aren't sent to any server.

## Why it exists

Every "JSON to YAML" website wants to paste an ad into your workflow, upload your file to their server, or make you create an account to remove the 50-item limit. None of these are problems a free browser tool should have.

Format Flipper is free. It runs entirely on your device — you can verify by opening DevTools and watching the Network tab. Your file is never uploaded. The tool works offline after the first page load. If the site ever disappears, you can save the HTML file and keep using it forever.

This is the [Tooly McToolface](https://toolymctoolface.com) philosophy applied to format conversion specifically. See [the essay on what "client-side" actually means](https://toolymctoolface.com/blog/client-side-really-means/) for the longer version.

## Architecture: the star topology

The technically interesting part of Format Flipper is that it doesn't implement *N × (N-1)* conversion paths directly. That would be 72 functions to maintain. Instead, every format converts to and from a shared intermediate representation — just plain JavaScript values — and the router composes those two halves to produce any conversion.

```
         JSON ──┐         ┌── JSON
       NDJSON ──┤         ├── NDJSON
         YAML ──┤         ├── YAML
         TOML ──┤         ├── TOML
          INI ──┤         ├── INI
  .properties ──┤         ├── .properties
          CSV ──┼──value──┼── CSV
          TSV ──┤         ├── TSV
          XML ──┤         ├── XML
     Markdown ──┤         ├── Markdown
         HTML ──┤         ├── HTML
          SQL ──┘         └── SQL

        parsers       serializers
```

Adding a tenth format costs **one parse function and one serialize function** — and automatically gains support for converting to and from every other format. No combinatorial blowup. This is the approach Pandoc uses for document formats, simplified for tabular data and simple object hierarchies.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical write-up, including the tradeoffs of each parser and the three places where round-tripping is genuinely lossy (and why).

## Running it

Format Flipper is a single HTML file with inline CSS and JavaScript. No build step, no dependencies to install.

**To use the tool:**
- [Use the hosted version](https://toolymctoolface.com/format/), or
- Download `index.html` from this repo, double-click it, done.

**To develop:**
```bash
git clone https://github.com/toolymctoolface/format-flipper.git
cd format-flipper
# open index.html in any browser — no build, no server needed
```

For a slightly nicer dev loop, a local server helps with live reload:
```bash
python3 -m http.server 8080
# or: npx serve
# or: any static file server
```

Visit `http://localhost:8080` and start editing `index.html`.

**To run tests:**
```bash
node test/run.js
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add a new format or propose a change.

## No framework, no build step, no npm

This is by design. The tool is 97 KB of handwritten HTML + CSS + JS, including the bundled js-yaml parser. Opening it in Chrome takes 40 ms. There is no React, no Vue, no Vite, no TypeScript compiler, no Webpack, no Babel, no PostCSS, no polyfills. A browser from 2022 will render it correctly.

If you fork this and want to add TypeScript or a framework, you're welcome to. But the single-file approach has specific advantages worth preserving:
- **Durability.** The tool keeps working as long as browsers support its subset of JS. No dependencies to patch.
- **Forkability.** Anyone can View Source and understand the whole thing.
- **Offline.** Works after a single page load, permanently.
- **No supply chain.** No `npm install` attack surface.

## License

MIT. See [LICENSE](./LICENSE). Use it however you like, including commercially, including as a starting point for something proprietary. Credit is appreciated but not required.

## Credits

- **[js-yaml](https://github.com/nodeca/js-yaml)** by Vitaly Puzrin and contributors, bundled inline under the MIT license. The single non-trivial dependency.
- Tooly McToolface is built by one person, [@toolymctoolface](mailto:toolymctoolface@gmail.com).
- The name is a Boaty McBoatface reference. It made me laugh and I refused to un-laugh.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The most welcome contributions are new format support (patch the star topology with a new parser/serializer pair) and test coverage for edge cases in existing formats.

## Changelog

For release notes across the whole Tooly McToolface workshop — including Format Flipper's feature additions — see [the hosted changelog](https://toolymctoolface.com/changelog/).
