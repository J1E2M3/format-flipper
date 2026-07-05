# Architecture

How Format Flipper converts between 11 formats using 22 functions instead of 110.

## The problem

Given N formats, naive conversion requires N × (N−1) conversion functions — every format to every other format. For 11 formats, that's 110 functions to write, test, and maintain.

```
JSON → YAML         YAML → JSON         TOML → JSON         CSV → JSON    ...
JSON → TOML         YAML → TOML         TOML → YAML         CSV → YAML    ...
JSON → CSV          YAML → CSV          TOML → CSV          CSV → TOML    ...
...                 ...                 ...                  ...
```

Adding a tenth format costs 18 more functions (to and from every existing format). Adding the eleventh costs 20. The complexity is O(N²).

## The solution: star topology

Every format has a parser that converts **format → value** and a serializer that converts **value → format**. Conversion between any two formats is the composition of parse and serialize with the intermediate value in the middle.

```
Input:  '{ "name": "Tooly" }'   (JSON)

Step 1:  JSON parser  → { name: "Tooly" }   (plain JS object)

Step 2:  YAML serializer  → "name: Tooly\n"   (YAML)
```

The cost of adding a format is now **one parse function and one serialize function**. That's it — the format instantly works with every other format in both directions, because the router just composes the pair with any other format's pair.

For 11 formats, this is 22 functions instead of 110. For 20 formats, it would be 40 functions instead of 380. The complexity is O(N).

This is the approach [Pandoc](https://pandoc.org) uses for document formats, simplified here for tabular data and simple object hierarchies.

## The intermediate representation

The intermediate representation is deliberately minimal: **plain JavaScript values.** Objects, arrays, strings, numbers, booleans, and null. That's the whole thing. No custom node types, no wrappers, no traversal helpers.

```javascript
parseJson('{"name": "Tooly", "tools": ["json", "yaml"]}')
// → { name: "Tooly", tools: ["json", "yaml"] }

parseYaml('name: Tooly\ntools:\n  - json\n  - yaml')
// → { name: "Tooly", tools: ["json", "yaml"] }

parseToml('name = "Tooly"\ntools = ["json", "yaml"]')
// → { name: "Tooly", tools: ["json", "yaml"] }
```

Using plain JS as the intermediate buys three things:

1. **No marshaling cost.** A parser returns exactly what you'd serialize.
2. **No traversal layer.** You can `JSON.stringify` the intermediate and get the JSON output for free.
3. **Ecosystem compatibility.** Every JS library that accepts "an object" accepts the intermediate.

It loses one thing: there's no place to store metadata that doesn't fit JS values cleanly — comments, custom date types, precision flags. These are handled case by case (see "Where the topology breaks" below).

For the formats that have native structure (JSON, YAML, TOML), the intermediate IS the parsed value — no conversion step. For tabular formats (CSV, TSV, SQL), the parser interprets the first row as headers and emits an array of objects. For document formats (XML, HTML, Markdown), the parser emits a nested structure that's reasonable for the format's tabular/hierarchical subset.

## Where the topology breaks

Three places where the intermediate value is lossy by design, and what the fallback is.

### Comments

JSON, CSV, TSV have no comment syntax. YAML, TOML, XML, HTML, Markdown, and SQL all do. Round-tripping `YAML (with comments) → JSON → YAML` loses the comments because JSON can't represent them.

**Decision:** Comments are dropped on parse. There's no good place to store them alongside plain JavaScript values without inventing a wrapper type, and inventing a wrapper type gives up the "intermediate is just a JS value" simplicity that pays for itself everywhere else.

### Dates

TOML has a first-class date type. JSON doesn't. YAML sometimes parses an ISO 8601 string as a date and sometimes doesn't depending on the parser version. CSV is always a string.

**Decision:** Dates round-trip as ISO 8601 strings. A TOML date becomes a JSON string `"2024-10-08T14:11:35Z"` in transit, which re-parses as a string if converted back to TOML. This is lossy (the target TOML is a string, not a date) but predictable.

See [the ISO 8601 vs Unix epoch article](https://toolymctoolface.com/blog/iso-8601-vs-unix-epoch/) for why this format was chosen.

### Arbitrary precision numbers

JSON's spec allows any precision. JavaScript's `JSON.parse` clamps integers at 2^53. TOML integers are 64-bit. An integer larger than 2^53 in TOML, parsed through JavaScript, round-trips with precision loss.

**Decision:** Numbers live in the intermediate representation as JavaScript `Number`. Beyond 2^53, precision is lost. Workaround documented in tool UI: for very large integers, stringify them in the source format.

See [the JSON vs YAML vs TOML article](https://toolymctoolface.com/blog/json-yaml-toml/) for the longer version of this gotcha.

## The router

The function that composes parse and serialize is simple:

```javascript
function convert(input, fromFormat, toFormat, opts) {
  if (fromFormat === toFormat) return input;
  const value = PARSERS[fromFormat](input, opts);
  return SERIALIZERS[toFormat](value, opts);
}
```

That's the entire conversion engine. Everything else is in the parse and serialize functions for each format. `value` is just a plain JavaScript value — an object, array, string, number, or composition thereof.

## The 11 parsers and serializers

Each lives in its own section of `index.html` (not yet extracted into separate files, but clearly delineated). Quick summary of the non-obvious choices:

### JSON

- Uses native `JSON.parse` / `JSON.stringify`
- Accepts JSONC (comments + trailing commas) as input via a pre-processor
- Serializes with 2-space indent by default

### NDJSON

- One JSON value per physical line; blank lines are skipped
- Strict per-line `JSON.parse` — no JSONC leniency, so parse errors carry an exact line number
- Parses to an array of values; serializes an array as one compact line per element (a non-array value becomes a single line)

### YAML

- Uses bundled `js-yaml` for both directions (YAML 1.2)
- Quotes strings that would be ambiguous (e.g., `"yes"`, `"no"`, numeric-looking strings)
- This is the one place where the bundle size is non-trivial (~39 KB for js-yaml)

### TOML

- Custom parser, hand-written in ~400 lines
- Supports the TOML 1.0 subset that matters for config files: scalars, tables, inline tables, array-of-tables, dates, and multi-line strings (`"""basic"""` with escapes and line-ending backslash continuation, `'''literal'''`, leading newline trimmed)
- Multi-line strings are normalized into single-line tokens by a pre-pass, so the line-based parser core stays simple; a closing delimiter immediately preceded by quote characters (the `"""..""` spec corner) is read as first-closer-wins
- Remaining gaps: hex/octal/binary integer literals and inline dotted keys (use the `[section]` form)
- Serializer preserves pair ordering, emits idiomatic TOML (bare keys when possible, quoted keys when required); multi-line values are emitted as single-line escaped strings, which round-trip cleanly

### INI

- Global keys before any section become top-level values; `[section]` headers become nested objects, and dotted headers (`[a.b]`) descend a path (TOML symmetry — also how the serializer expresses deeper nesting)
- Unquoted values run through the shared scalar coercion (so the "Coerce types" toggle applies); double-quoted values are taken literally with `\\ \" \n \t \r` escapes — that's how ambiguous strings like `"007"` round-trip
- Full-line comments only (`;` or `#` as the first character) — values legitimately contain those characters inline, and INI has no quoting convention that disambiguates
- Arrays and non-section objects are stored as JSON strings (INI has no list syntax; one-way lossy, matching the CSV convention); `null` becomes an empty value that re-parses as `''`
- Duplicate keys and malformed lines throw with the line number, mirroring the TOML parser

### CSV and TSV

- RFC 4180 compliant for CSV
- Handles quoted fields with embedded commas and newlines
- First row is treated as header on parse
- Cell text is type-coerced by default (`"true"` → `true`, `"42"` → `42`); the input-side "Coerce types" toggle turns this off for all untyped tabular formats
- On serialize, arrays of objects become rows; everything else stringifies the top-level

### XML

- Simple DOM-level model: elements, attributes, text nodes
- Attributes become object keys with `@`-prefix (XSLT-style convention); the text content of an attribute-bearing element lands in a `#text` key
- Text and attribute values are type-coerced by default (including `'null'` → `null`); with "Coerce types" off, every value stays exactly the string that was typed
- No DTD or namespace support — just the subset used for data exchange

### Markdown

- Parses GFM pipe tables (escaped pipes, `<br>` line breaks in cells)
- Serializes back to GFM-style syntax
- Not trying to be a full Markdown parser (that's a different project)

### HTML

- Extracts the first `<table>` element's rows; markup outside it is ignored
- Serializes clean minimal HTML tables without inline styles

### SQL

- Recognizes `CREATE TABLE` + `INSERT INTO` patterns for tabular round-tripping
- Serializer emits the same two statements for any array-of-objects input
- Not a general SQL parser

## Adding a new format

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version:

1. Write a `parseXxx(input) → value` function (returns a plain JS object/array/scalar).
2. Write a `serializeXxx(value) → string` function.
3. Register both in the `PARSERS` and `SERIALIZERS` objects.
4. Add the format to the UI's format selector.
5. Add tests for the round-trip and at least two cross-format conversions.

Total effort: usually 100-300 lines of new code, plus tests.

## Why single-file?

The whole tool is one HTML file because:

- **Durability.** As long as browsers run JavaScript, this file works. No build chain to break, no dependencies to patch.
- **Offline.** First page load caches everything; subsequent uses need no network.
- **Forkable.** View Source shows everything. No obfuscation, no transpiled bundle.
- **Fast.** No framework boot time. 40 ms to interactive on a 2024 MacBook.
- **Auditable.** You can read the entire tool in ~4000 lines of HTML+JS.

If you want to extract the parsers into a proper npm package for server-side use, you're welcome to — the MIT license permits it. An organized extraction is on the project roadmap as a follow-on release.
