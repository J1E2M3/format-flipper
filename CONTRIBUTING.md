# Contributing

Thanks for considering a contribution. The project is small, the maintainer is one person, and the most valuable contributions are:

1. **New format support** (the star-topology architecture makes this tractable).
2. **Test coverage** for edge cases in existing formats.
3. **Bug reports** with concrete repro cases.
4. **Documentation fixes** — typos, broken links, outdated examples.

## Filing an issue

Before filing, check whether one already exists. If it's a bug:

- What format(s) are involved?
- Input that reproduces the bug (small, please)
- Expected output vs actual output
- Browser and version, if UI-related

If it's a feature request, frame it as the problem it solves rather than the solution you want. "I can't easily convert Protocol Buffers to JSON" is more useful than "please add protobuf support."

## Adding a new format

This is the contribution that pays the best return — a new format instantly gains support for converting to and from all nine existing formats.

### 1. Understand the intermediate representation

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first. The intermediate is plain JavaScript values — objects, arrays, scalars — not a custom AST. Your parser returns a JS value; your serializer takes one.

### 2. Write the parser

Name it `parseXxx` where `Xxx` is your format. Signature:

```javascript
function parseXxx(input /* string */, opts = {} /* shared UI options */) /* → JS value */ {
  // Parse input, return a plain JS object, array, or scalar.
  // Throw an Error with a helpful message if input is malformed.
}
```

If your format carries untyped text (like CSV cells), route scalar text through the shared `coerceScalar(text, opts)` helper so the UI's "Coerce types" toggle applies to your format too.

Rules of thumb:
- **Throw on malformed input**, don't silently drop data. Format Flipper surfaces errors to the user in a specific way and it expects parsers to throw.
- **Preserve ordering** in objects/arrays. Humans notice when key order changes.
- **Handle the top-level-scalar case.** Most formats let you express a bare string or number at the top level; your parser should too.

### 3. Write the serializer

Name it `serializeXxx`. Signature:

```javascript
function serializeXxx(value /* JS value */) /* → string */ {
  // Convert a plain JS value to your format, return a string.
  // Produce idiomatic output — emit comments/whitespace the format normally uses.
}
```

Rules of thumb:
- **Emit readable output.** Two-space indentation, whitespace around operators, etc.
- **Quote when ambiguous.** If a string looks like a number or a boolean in your format, quote it.
- **Handle unrepresentable values** gracefully. If your format can't express nested objects (e.g., CSV), flatten or stringify with a clear convention.

### 4. Register the format

In `index.html`, find the `PARSERS` and `SERIALIZERS` objects and add your format:

```javascript
const PARSERS = {
  // ... existing entries
  xxx: parseXxx,
};
const SERIALIZERS = {
  // ... existing entries
  xxx: serializeXxx,
};
```

Also add your format to the UI's format selector (`<option value="xxx">XXX</option>`). If your format needs options, push a descriptor in `renderOptions()` — supported types are `number`, `text`, `checkbox`, and `select`.

### 5. Write tests

Minimum test coverage for a new format:

- **Round-trip for a complex input.** `parseXxx(serializeXxx(value))` should produce an equivalent value (allowing for predictable lossiness documented in ARCHITECTURE.md).
- **At least two cross-format conversions.** Your format → JSON and JSON → your format.
- **Edge cases:** empty input, top-level scalar, deeply nested, special characters, Unicode.

Tests live in `test/` and are run with `node test/run.js`. See existing test files for the pattern.

### 6. Document

Add a row to the supported-formats table in [README.md](./README.md) and a section to [ARCHITECTURE.md](./ARCHITECTURE.md) describing any non-obvious choices you made.

## Code style

The project is plain JavaScript with no linter. A few conventions:

- **Two spaces for indentation.** Not tabs.
- **Semicolons.** Always.
- **Single quotes for strings.** Except when the string contains single quotes, in which case use double.
- **Prefer `const`, then `let`.** Avoid `var`.
- **Prefer functions, not classes.** The codebase is deliberately low-ceremony; we don't need inheritance for parsers.
- **No external dependencies without discussion.** The current dependency count is 1 (js-yaml, bundled inline). Additions need to justify themselves.

## Philosophy

Format Flipper is intentionally a small, durable, auditable tool. Contributions that move it toward "a proper web app with a framework and a build step" will probably be declined with thanks. Contributions that make the existing tool better at what it already does are always welcome.

## Pull request checklist

Before submitting:

- [ ] The tool still works (open `index.html` in a browser, try a conversion)
- [ ] Tests pass (`node test/run.js`)
- [ ] New code follows the existing style
- [ ] If adding a format: README table updated, ARCHITECTURE section added
- [ ] If fixing a bug: a test case that would have caught it

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
